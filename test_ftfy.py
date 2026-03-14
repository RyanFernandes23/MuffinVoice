import ftfy
from src.TextExtractor.text_extractor import TextExtractor
import os

def test_encoding_fix():
    print("--- Testing Encoding Fix (ftfy) ---")
    
    # 1. Direct ftfy test
    # Full mojibake for “I didn’t know that!”
    # “ = â€œ
    # ’ = â€™
    # ” = â€
    mojibake = "The doctor said, â€œI didnâ€™t know that!â€"
    print(f"Mojibake: {mojibake}")
    
    fixed = ftfy.fix_text(mojibake)
    print(f"Fixed:    {fixed}")
    
    if "didn't" in fixed or "didn’t" in fixed:
        print("✅ Direct check passed!")
    else:
        print("❌ Direct check failed.")

    # 2. TextExtractor test
    test_file = "test_mojibake.txt"
    # We write it with a fallback encoding to ensure the characters land in the file as "broken"
    with open(test_file, "w", encoding="utf-8") as f:
        f.write(mojibake)
    
    try:
        extractor = TextExtractor(test_file)
        extracted_text = extractor.extract_file()
        print(f"\nExtracted from file: {extracted_text}")
        
        if "didn't" in extracted_text or "didn’t" in extracted_text:
            print("✅ TextExtractor integration passed!")
        else:
            print("❌ TextExtractor integration failed.")
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)

if __name__ == "__main__":
    test_encoding_fix()
