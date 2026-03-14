import json
import re
from typing import Dict, Tuple

try:
    from num2words import num2words
except ImportError:
    num2words = None


class AbbreviationManager:
    """Handles default + custom abbreviations for TTS cleaning."""

    def __init__(self, defaults_file: str = "default_abbreviations.json"):
        self._abbreviations = {}
        self._sources = {}
        
        # load defaults from file
        try:
            with open(defaults_file, "r") as f:
                self._abbreviations = json.load(f)
            self._sources = {abbr: "default" for abbr in self._abbreviations}
        except FileNotFoundError:
            pass

        # merge with user custom file
        try:
            with open("abbreviations.json", "r") as f:
                file_abbr = json.load(f)
                self._abbreviations.update(file_abbr)
                self._sources.update({abbr: "custom" for abbr in file_abbr})
        except FileNotFoundError:
            self.save_abbreviations()

        self._compile_master_regex()

    def _compile_master_regex(self):
        """Compiles a single master regex for O(1) abbreviation lookup."""
        if not self._abbreviations:
            self._master_pattern = None
            self._lower_abbreviations = {}
            return

        # Sort by length descending to ensure longer matches take priority
        escaped_keys = map(re.escape, sorted(self._abbreviations.keys(), key=len, reverse=True))
        
        # Match only on word boundaries
        pattern_str = rf"(?<!\w)({'|'.join(escaped_keys)})(?!\w)"
        self._master_pattern = re.compile(pattern_str, re.IGNORECASE)
        
        self._lower_abbreviations = {k.lower(): v for k, v in self._abbreviations.items()}

    def remove_extra_spaces(self, text: str) -> str:
        return re.sub(r" +", " ", text).strip()

    def remove_linebreaks(self, text: str) -> str:
        return text.replace("\n", " ").replace("\r", " ")

    def citations_cleaner(self, text: str) -> str:
        return re.sub(r"(\[\d+\]|[¹²³⁴⁵⁶⁷⁸⁹]+)", "", text)

    def garbage_cleaner(self, text: str) -> str:
        # Keep ASCII 32-126 plus common currency/quotes
        return re.sub(r'[^\x20-\x7E\n\t\u2018-\u201D\u2013\u2014$£€]', '', text)

    def markdown_cleaner(self, text: str) -> str:
        # 1. Links: [label](url) -> label
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        # 2. Headers: # Title -> Title
        text = re.sub(r'(?m)^#+\s+', '', text)
        # 3. Bold/Italic: **text** -> text
        text = re.sub(r'[*_]{1,3}(.*?)[*_]{1,3}', r'\1', text)
        # 4. Starting line markers
        text = re.sub(r'(?m)^\s*[-*>+]\s+', '', text)
        return text

    def save_abbreviations(self):
        custom_only = {
            abbr: exp
            for abbr, exp in self._abbreviations.items()
            if self._sources.get(abbr) == "custom"
        }
        try:
            with open("abbreviations.json", "w") as f:
                json.dump(custom_only, f, indent=4)
        except:
            pass

    def add(self, abbr: str, expansion: str, override: bool = True):
        if override or abbr not in self._abbreviations:
            self._abbreviations[abbr] = expansion
            self._sources[abbr] = "custom"
            self._compile_master_regex()
            self.save_abbreviations()

    def all(self) -> Dict[str, Dict[str, str]]:
        return {
            abbr: {"expansion": exp, "source": self._sources.get(abbr, "unknown")}
            for abbr, exp in self._abbreviations.items()
        }

    def expand_in_text(self, text: str) -> Tuple[str, int]:
        if not self._master_pattern:
            return text, 0
        count = 0
        def replacer(match):
            nonlocal count
            count += 1
            return self._lower_abbreviations.get(match.group(0).lower(), match.group(0))
        text, replaced_count = self._master_pattern.subn(replacer, text)
        return text, replaced_count


class TTSTextCleaner:
    def __init__(self, defaults_file: str = "default_abbreviations.json", lang: str = "en"):
        self.abbrev_manager = AbbreviationManager(defaults_file)
        self.lang = lang

    def _normalize_numbers_and_currency(self, text: str) -> str:
        if not num2words:
            return text

        def replace_currency(match):
            symbol = match.group(1)
            amount_str = match.group(2).replace(',', '')
            trailing_period = ""
            if amount_str.endswith('.'):
                amount_str = amount_str[:-1]
                trailing_period = "."
            try:
                amount = float(amount_str)
                currency = "dollars" if symbol == "$" else "pounds" if symbol == "£" else ""
                return f"{num2words(amount)} {currency}{trailing_period}"
            except:
                return match.group(0)

        text = re.sub(r'([$£])([\d,]+(?:\.\d+)?)', replace_currency, text)

        def replace_numbers(match):
            try:
                return num2words(int(match.group(0)))
            except:
                return match.group(0)

        return re.sub(r'\b\d+\b', replace_numbers, text)

    def __call__(self, text: str, abbrevate: bool = True):
        # 1. Clean Markdown Links FIRST
        text = self.abbrev_manager.markdown_cleaner(text)

        # 2. Protect remaining special entities
        placeholders = {}
        def protect(match):
            key = f"{{{{P{len(placeholders)}}}}}"
            placeholders[key] = match.group(0)
            return key

        text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', protect, text)
        text = re.sub(r'https?://[^\s<>"]+|www\.[^\s<>"]+', protect, text)

        # 3. Basic cleaning
        text = self.abbrev_manager.citations_cleaner(text)
        text = self.abbrev_manager.garbage_cleaner(text)
        text = self.abbrev_manager.remove_linebreaks(text)
        text = self.abbrev_manager.remove_extra_spaces(text)
        
        # 4. Expansion
        if abbrevate:
            text = self._normalize_numbers_and_currency(text)
            text, _ = self.abbrev_manager.expand_in_text(text)

        # 5. Restore
        for key, original in placeholders.items():
            text = text.replace(key, original)
            
        return text


if __name__ == "__main__":
    cleaner = TTSTextCleaner()
    
    # Chaos test
    chaos_test = """
    # Stress Test
    This is a **markdown** report with [broken links](https://test.com) & garbage characters.
    Check $1,234.56 cost vs £50.00. 
    Visit https://wikivoice.io or mail support@wiki.io.
    Inc. Dr. Smith approved the appt. [1]
    """
    
    # Add custom ones for test
    cleaner.abbrev_manager.add("AI", "Artificial Intelligence")
    cleaner.abbrev_manager.add("TTS", "Text to Speech")
    
    theory_test = "AI researchers are working on TTS systems."

    print("--- EXPERIMENTAL TEST SUITE ---")
    print(f"\n[STRESS TEST]\nOriginal:\n{chaos_test.strip()}")
    print(f"\nResult:\n{cleaner(chaos_test, True)}")
    
    print(f"\n[GLOSSARY TEST]\nOriginal: {theory_test}")
    print(f"Result: {cleaner(theory_test, True)}")

    print("\n--- TEST COMPLETE ---")
