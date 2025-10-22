from wtpsplit import SaT

# Pick a model, e.g., sat-3l-sm (good speed + quality)
sat = SaT("sat-9l-sm")

# Optional: use half-precision + GPU if available
# sat = sat.half().to("cuda")

def segment_text(text):
    segments = sat.split(text,do_paragraph_segmentation=True)
    return segments

def segment_generator(text):
    for chunk in sat.split(text):
        yield chunk

if __name__ == "__main__":
    with open(r"src\artifacts\cleaned\jingling.txt", "r", encoding="utf-8") as f:
        text = f.read()
    segments = segment_text(text)
    print(segments)