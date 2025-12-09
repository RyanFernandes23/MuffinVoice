import re
import json
from typing import Dict


class AbbreviationManager:
    """Handles default + custom abbreviations for TTS cleaning."""

    def __init__(self, defaults_file: str = "default_abbreviations.json"):
        # load defaults from file
        try:
            with open(defaults_file, "r") as f:
                self._abbreviations = json.load(f)
            self._sources = {abbr: "default" for abbr in self._abbreviations}
            print(f"Loaded defaults from {defaults_file}")
        except FileNotFoundError:
            print(f"⚠️ Couldn't find {defaults_file}, starting with empty defaults")
            self._abbreviations = {}
            self._sources = {}

        # merge with user custom file
        try:
            print("Loading abbreviations.json")
            with open("abbreviations.json", "r") as f:
                file_abbr = json.load(f)
                self._abbreviations.update(file_abbr)
                self._sources.update({abbr: "custom" for abbr in file_abbr})
        except FileNotFoundError:
            print("Couldn't find abbreviations.json, creating one")
            self.save_abbreviations()


    def remove_extra_spaces(self, text: str) -> str:
        return re.sub(r"\s+", " ", text)
    def remove_linebreaks(self, text: str) -> str:

        return text.replace("\n", " ")
    def citations_cleaner(self, text: str) -> str:
        """Removes citation references like [12] and superscripts like ³³."""
        return re.sub(r"(\[\d+\]|[¹²³⁴⁵⁶⁷⁸⁹]+)", "", text)

    def save_abbreviations(self):
        print("Saving abbreviations.json")
        # save only customs
        custom_only = {
            abbr: exp
            for abbr, exp in self._abbreviations.items()
            if self._sources.get(abbr) == "custom"
        }
        with open("abbreviations.json", "w") as f:
            json.dump(custom_only, f, indent=4)

    def add(self, abbr: str, expansion: str, override: bool = True):
        if override or abbr not in self._abbreviations:
            self._abbreviations[abbr] = expansion
            self._sources[abbr] = "custom"
        self.save_abbreviations()

    def remove(self, abbr: str):
        self._abbreviations.pop(abbr, None)
        self._sources.pop(abbr, None)
        self.save_abbreviations()

    def all(self) -> Dict[str, Dict[str, str]]:
        return {
            abbr: {"expansion": exp, "source": self._sources.get(abbr, "unknown")}
            for abbr, exp in self._abbreviations.items()
        }

    def expand_in_text(self, text: str) -> tuple[str, int]:
        count = 0
        for abbr, full in self._abbreviations.items():
            pattern = re.compile(r"\b" + re.escape(abbr), re.IGNORECASE)
            text, replaced = pattern.subn(full, text)
            count += replaced
        return text, count


class TTSTextCleaner:
    def __init__(self, defaults_file: str = "default_abbreviations.json"):
        self.abbrev_manager = AbbreviationManager(defaults_file)

    def __call__(self, text: str, abbrevate: bool):
        text = self.abbrev_manager.remove_extra_spaces(text)
        text = self.abbrev_manager.citations_cleaner(text)
        text = self.abbrev_manager.remove_linebreaks(text)
        if abbrevate == True:
            return self._expand_abbreviations(text)
        else:
            return text

    def _expand_abbreviations(self, text: str) -> str:
        text, _ = self.abbrev_manager.expand_in_text(text)
        return text


if __name__ == "__main__":
    cleaner = TTSTextCleaner()
    res = cleaner("Hello my name is inc. I had an appt. for mrs. darwin ³³ [12]. I also have a phone number 123-456-7890. My email is 6gE3F@example.com")
    print(res)

    # Show all abbreviations with source info
    import pprint
    pprint.pprint(cleaner.abbrev_manager.all())
