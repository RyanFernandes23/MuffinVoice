import pysbd

def segment_text(text, language="en"):
    if not text:
        return []
    
    seg = pysbd.Segmenter(language=language, clean=False)
    segments = seg.segment(text)
    return segments


def segment_generator(text, language="en"):
    if not text:
        return
    
    seg = pysbd.Segmenter(language=language, clean=False)
    for chunk in seg.segment(text):
        yield chunk


if __name__ == "__main__":
    test_text = "Dr. Smith arrived at 5 P.M. This is another sentence. \n\n This is a third sentence in a new paragraph."
    segments = segment_text(test_text)
    for i, s in enumerate(segments):
        print(f"{i}: {s}")
