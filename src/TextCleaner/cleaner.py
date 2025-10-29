from cleantext import clean
from src.TextCleaner.cleaner_stage1 import TTSTextCleaner
import os

def TextCleaner(text):
    cleaner = TTSTextCleaner()
    
    c1 = clean(text,
        fix_unicode=True,               # fix various unicode errors
        to_ascii=True,                  # transliterate to closest ASCII representation
        lower=True,                     # lowercase text
        no_line_breaks=True,           # fully strip line breaks as opposed to only normalizing them
        no_urls=True,                  # replace all URLs with a special token
        no_emails=True,                # replace all email addresses with a special token
        no_phone_numbers=True,         # replace all phone numbers with a special token
        no_numbers=False,               # replace all numbers with a special token
        no_digits=False,                # replace all digits with a special token
        no_currency_symbols=False,      # replace all currency symbols with a special token
        no_punct=False,                 # remove punctuations
        replace_with_punct="",          # instead of removing punctuations you may replace them
        replace_with_url="<URL>",
        replace_with_email="<EMAIL>",
        replace_with_phone_number="<PHONE>",
        replace_with_number="<NUMBER>",
        replace_with_digit="0",
        replace_with_currency_symbol="<CUR>",
        lang="en"                       # set to 'de' for German special handling
    )
    result = cleaner(c1)
    return result

if __name__ == "__main__":
    cleaner = TTSTextCleaner()
    cleaner.abbrev_manager.add("appt.", "appointment")
    cleaner.abbrev_manager.add("@", "at")
    

    filepath = r"src\TTS\artifacts\AI-Powered Drawing Tool Research_.txt"
    filename = filepath.split("/")[-1]

    try:
        with open(filepath, "r", encoding="utf-8") as f:  # Specify UTF-8 encoding
            text = f.read()
    except FileNotFoundError:
        print(f"Error: File not found at {filepath}")
        exit()
    except UnicodeDecodeError as e:
        print(f"Error decoding file: {e}")
        exit()

    result = cleaner(text)

    try:
        os.makedirs("src/TTS/artifacts/cleaned", exist_ok=True)
        newpath = os.path.join("src/TTS/artifacts/cleaned", "jingling.txt")
        with open(newpath, "w", encoding="utf-8") as f:  # Also specify UTF-8 encoding for writing
            f.write(result)
        print("File cleaned and updated successfully.")
    except Exception as e:
        print(f"Error writing to file: {e}")

    print(result)