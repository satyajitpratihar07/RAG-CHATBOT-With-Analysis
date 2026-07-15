from typing import List, Optional

class RecursiveCharacterTextSplitter:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50, separators: Optional[List[str]] = None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", ". ", "? ", "! ", " ", ""]

    def split_text(self, text: str) -> List[str]:
        return self._split_text(text, self.separators)

    def _split_text(self, text: str, separators: List[str]) -> List[str]:
        # If the text is already smaller than the target chunk size, return it
        if len(text) <= self.chunk_size:
            return [text]

        # Choose the first separator that appears in the text
        separator = ""
        remaining_separators = []
        for i, s in enumerate(separators):
            if s == "":
                separator = s
                remaining_separators = separators[i+1:]
                break
            if s in text:
                separator = s
                remaining_separators = separators[i+1:]
                break

        # Split text by the separator
        if separator != "":
            splits = text.split(separator)
        else:
            # If no separators match, split characters
            splits = list(text)

        # Merge splits into chunks of appropriate sizes
        chunks = []
        current_chunk = []
        current_length = 0

        for split in splits:
            # Re-attach the separator if it's not the end
            # (unless it's character split or standard space split, in which case we put it back in the join)
            split_len = len(split)
            
            # If a single split exceeds chunk_size, we split it recursively
            if split_len > self.chunk_size:
                # Flush the current chunk first
                if current_chunk:
                    chunks.append(separator.join(current_chunk))
                    current_chunk = []
                    current_length = 0
                
                # Recursively split the oversized sub-part
                sub_chunks = self._split_text(split, remaining_separators)
                chunks.extend(sub_chunks)
            else:
                # Check if adding this split exceeds our chunk size limit
                # We add length of separator if current_chunk is not empty
                sep_len = len(separator) if current_chunk else 0
                if current_length + sep_len + split_len > self.chunk_size:
                    # Flush the current chunk
                    chunks.append(separator.join(current_chunk))
                    
                    # Start a new chunk with overlap
                    # Keep elements from the end of current_chunk that fit within chunk_overlap
                    overlap_chunk = []
                    overlap_len = 0
                    # Traverse backwards to collect overlap elements
                    for prev_split in reversed(current_chunk):
                        prev_sep_len = len(separator) if overlap_chunk else 0
                        if overlap_len + prev_sep_len + len(prev_split) <= self.chunk_overlap:
                            overlap_chunk.insert(0, prev_split)
                            overlap_len += prev_sep_len + len(prev_split)
                        else:
                            break
                    
                    current_chunk = overlap_chunk
                    current_length = overlap_len
                
                current_chunk.append(split)
                sep_len = len(separator) if len(current_chunk) > 1 else 0
                current_length += sep_len + split_len

        if current_chunk:
            chunks.append(separator.join(current_chunk))

        # Filter out empty chunks and strip whitespaces
        return [c.strip() for c in chunks if c.strip()]

def get_chunks(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    return splitter.split_text(text)
