import nltk
from nltk.tokenize import sent_tokenize

def _ensure_nltk_data():
    """Ensure NLTK data is downloaded. Done inside a function to avoid multi-thread/process racing on import."""
    try:
        nltk.data.find('tokenizers/punkt')
        nltk.data.find('tokenizers/punkt_tab')
    except (LookupError, AttributeError):
        # We only try to download if it's actually missing
        nltk.download('punkt', quiet=True)
        nltk.download('punkt_tab', quiet=True)


def segment_text(text):
    if not text:
        return []
    
    _ensure_nltk_data()
    # NLTK sent_tokenize returns a list of sentences
    segments = sent_tokenize(text)
    return segments


def segment_generator(text):
    if not text:
        return
    
    _ensure_nltk_data()
    for chunk in sent_tokenize(text):
        yield chunk


if __name__ == "__main__":
    test_text = "This is a sentence. This is another sentence. \n\n This is a third sentence in a new paragraph."
    segments = segment_text(test_text)
    print(segments)
