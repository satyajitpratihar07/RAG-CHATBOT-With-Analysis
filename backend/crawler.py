import re
import urllib.parse
from urllib.robotparser import RobotFileParser
from typing import Set, List, Dict, Generator, Any, Optional
from bs4 import BeautifulSoup
import httpx
import logging

logger = logging.getLogger(__name__)

# Cache for RobotFileParsers to avoid refetching robots.txt for the same domain multiple times
_robots_cache: Dict[str, RobotFileParser] = {}

def get_robots_parser(base_url: str) -> Optional[RobotFileParser]:
    parsed = urllib.parse.urlparse(base_url)
    domain_key = f"{parsed.scheme}://{parsed.netloc}"
    
    if domain_key in _robots_cache:
        return _robots_cache[domain_key]
        
    robots_url = f"{domain_key}/robots.txt"
    rp = RobotFileParser()
    rp.set_url(robots_url)
    try:
        # Use simple httpx request with small timeout to fetch robots.txt
        with httpx.Client(timeout=3.0, follow_redirects=True) as client:
            response = client.get(robots_url)
            if response.status_code == 200:
                rp.parse(response.text.splitlines())
            else:
                # If robots.txt doesn't exist, assume all pages are crawlable
                rp.parse([])
    except Exception as e:
        logger.warning(f"Could not read robots.txt from {robots_url}: {e}")
        # Allow indexing if robots.txt can't be fetched
        rp.parse([])
        
    _robots_cache[domain_key] = rp
    return rp

def is_allowed_by_robots(url: str, user_agent: str = "*") -> bool:
    try:
        rp = get_robots_parser(url)
        if rp:
            return rp.can_fetch(user_agent, url)
    except Exception:
        pass
    return True

def clean_html(html_content: str) -> Dict[str, str]:
    """
    Parses HTML, removes script/style/nav/footer/header elements,
    and returns page title and cleaned text content.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    
    # Extract title
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    
    # If no title tag, use first H1
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text().strip()
            
    # Default title
    if not title:
        title = "Untitled Page"
        
    # Remove unwanted tags
    for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "noscript", "aside", "form"]):
        tag.decompose()
        
    # Get text
    text = soup.get_text(separator="\n")
    
    # Clean whitespace and empty lines
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    clean_text = "\n".join(chunk for chunk in chunks if chunk)
    
    return {
        "title": title,
        "clean_content": clean_text
    }

def get_links(html_content: str, current_url: str, base_domain: str) -> Set[str]:
    """
    Finds all links on the page that belong to the same base domain.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    links = set()
    
    for anchor in soup.find_all("a", href=True):
        href = str(anchor["href"])
        # Resolve relative URLs
        full_url = urllib.parse.urljoin(current_url, href)
        # Strip fragment identifier (e.g. #section1)
        full_url = urllib.parse.urldefrag(full_url)[0]
        
        parsed_full = urllib.parse.urlparse(full_url)
        parsed_base = urllib.parse.urlparse(base_domain)
        
        # Keep URL only if it belongs to the same domain (or subdomain of target)
        if parsed_full.netloc == parsed_base.netloc or parsed_full.netloc.endswith("." + parsed_base.netloc):
            # Normalise back to string
            links.add(full_url)
            
    return links

def should_exclude(url: str, exclude_patterns: List[str]) -> bool:
    """
    Returns True if the URL matches any of the user-provided exclusion regex/substring patterns.
    """
    if not exclude_patterns:
        return False
        
    for pattern in exclude_patterns:
        if not pattern.strip():
            continue
        try:
            # Try to match pattern as standard regex
            if re.search(pattern, url):
                return True
        except re.error:
            # Fall back to substring match if regex is invalid
            if pattern in url:
                return True
    return False

def crawl_website(
    start_urls: List[str],
    max_depth: int = 2,
    exclude_patterns: Optional[List[str]] = None,
    respect_robots: bool = True,
    max_pages: int = 100
) -> Generator[Dict[str, Any], None, None]:
    """
    Crawls website recursively and yields page results:
    {
        'status': 'progress',
        'url': url,
        'title': title,
        'raw_content': raw_content,
        'clean_content': clean_content,
        'char_count': len,
        'word_count': len
    } or error statuses.
    """
    if exclude_patterns is None:
        exclude_patterns = []
        
    visited: Set[str] = set()
    # List of tuples: (url, depth)
    queue: List[Dict[str, Any]] = [{"url": u, "depth": 0} for u in start_urls]
    
    # We restrict crawling to domains of the start URLs
    allowed_domains = {urllib.parse.urlparse(u).netloc for u in start_urls}
    
    pages_crawled_count = 0
    
    headers = {
        "User-Agent": "RAGBotScraper/1.0 (+http://ragbot.com/crawler)"
    }
    
    with httpx.Client(timeout=10.0, follow_redirects=True, headers=headers) as client:
        while queue:
            if pages_crawled_count >= max_pages:
                yield {"status": "info", "message": f"Reached crawl limit of {max_pages} pages."}
                break
                
            current_item = queue.pop(0)
            url = current_item["url"]
            depth = current_item["depth"]
            
            if url in visited:
                continue
                
            visited.add(url)
            
            # Check domain boundary
            parsed_url = urllib.parse.urlparse(url)
            if parsed_url.netloc not in allowed_domains:
                continue
                
            # Check robots.txt
            if respect_robots and not is_allowed_by_robots(url, "RAGBotScraper"):
                yield {"status": "skipped", "url": url, "reason": "Excluded by robots.txt"}
                continue
                
            # Check exclusion patterns
            if should_exclude(url, exclude_patterns):
                yield {"status": "skipped", "url": url, "reason": "Excluded by user patterns"}
                continue
                
            yield {"status": "crawling", "url": url, "depth": depth}
            
            try:
                response = client.get(url)
                if response.status_code != 200:
                    yield {"status": "failed", "url": url, "reason": f"HTTP status {response.status_code}"}
                    continue
                    
                # Ensure it's HTML
                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    yield {"status": "skipped", "url": url, "reason": f"Content type is {content_type}"}
                    continue
                    
                raw_html = response.text
                page_data = clean_html(raw_html)
                
                title = page_data["title"]
                clean_text = page_data["clean_content"]
                
                pages_crawled_count += 1
                
                # Yield crawled page result
                yield {
                    "status": "page",
                    "url": url,
                    "title": title,
                    "raw_content": raw_html,
                    "clean_content": clean_text,
                    "char_count": len(clean_text),
                    "word_count": len(clean_text.split()),
                    "depth": depth
                }
                
                # Find links for the next depth level
                if depth < max_depth:
                    links = get_links(raw_html, url, url)
                    for link in links:
                        if link not in visited and not any(q["url"] == link for q in queue):
                            queue.append({"url": link, "depth": depth + 1})
                            
            except Exception as e:
                yield {"status": "failed", "url": url, "reason": str(e)}
                logger.error(f"Error crawling {url}: {e}")
