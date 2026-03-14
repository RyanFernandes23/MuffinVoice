# Text Normalization Libraries: Technical Comparison & Recommendations

When building a production-grade Natural Language Processing (NLP) or Text-to-Speech (TTS) pipeline, text normalization is the critical first step. This document compares popular text normalization libraries and provides a recommended architecture tailored for production systems (like WikiVoice).

## 1. Core Library Comparison

### **PySBD (Pragmatic Sentence Boundary Disambiguation)**
* **Primary Goal**: Sentence Segmentation
* **Mechanism**: Rule-based (Pragmatic approach)
* **Pros**: 
  * The gold standard for splitting paragraphs into sentences without breaking on abbreviations (e.g., "Dr.", "U.S.A.", "Ph.D.").
  * Excellent multilingual support (22+ languages).
  * Outperforms spaCy and NLTK for complex sentence boundaries.
* **Cons**: It *only* does segmentation; it does not clean noise, emojis, or fix encoding.
* **Best Use Case**: Splitting text into clean sentences right before feeding it to an inference model or TTS engine.

### **NeatText**
* **Primary Goal**: Granular Text Cleaning
* **Mechanism**: Regex-based & Object-Oriented Pipelines (`TextFrame`)
* **Pros**: 
  * "Swiss Army knife" for removing or extracting specific entities (emails, phone numbers, URLs, emojis, hashtags).
  * Great object-oriented structure for chaining operations.
* **Cons**: Can be overkill and slower than simple custom regex if you only need one or two specific cleaning functions.
* **Best Use Case**: Social media text mining or data where granular entity extraction/removal is needed.

### **Clean-Text (cleantext)**
* **Primary Goal**: General Formatting & Noise Removal
* **Mechanism**: Functional / Utility-based
* **Pros**: 
  * Highly effective at making text "machine-readable."
  * Best at fixing "mojibake" (encoding errors) and converting to ASCII.
  * Very robust `fix_unicode=True` feature for web-scraped data.
* **Cons**: Less flexible than NeatText for custom conditional extractions. It can be overly aggressive (e.g., replacing all numbers with `<NUM>`).
* **Best Use Case**: Initial scrubbing of messy, raw web-scraped data or user-submitted content.

---

## 2. Other Essential Tools (Industry Standards)

* **ftfy (Fixes Text For You)**: The industry standard for fixing broken Unicode (e.g., turning `â€œ` back into `“`). *Always use this at the very beginning of your pipeline.*
* **NVIDIA NeMo (Text Normalization)**: If you need to convert "123" into "one hundred twenty-three" or "$10" into "ten dollars" (crucial for TTS).
* **Textacy**: Built on top of spaCy. Useful if you already use spaCy and want higher-level APIs for preprocessing and linguistic statistics.
* **TextHero**: Designed for Pandas users. Great for Exploratory Data Analysis (EDA) and cleaning dataframes in a single line, but less suited for real-time text streams.

---

## 3. Recommended Production-Grade Pipeline (WikiVoice)

For a production TTS system like WikiVoice, a **Hybrid Modular Pipeline** is recommended over relying on a single "magic" library. General-purpose libraries can act as "black boxes" that accidentally strip punctuation needed for natural prosody.

### The "Golden Order" Architecture:

1. **Stage 0: The Gatekeeper (Encoding Fixes)**
   * **Tool**: `ftfy.fix_text()`
   * **Action**: Repairs broken Unicode from web scrapes (like Wikipedia) before your logic even sees it.

2. **Stage 1: Light Cleaning (Noise Removal)**
   * **Tool**: Standard Python `re` (Regex) + your `TTSTextCleaner`
   * **Action**: Remove domain-specific noise (e.g., Wikipedia `[1]` citations, extra whitespace, HTML tags). Custom regex is faster and more deterministic for this than heavy NLP libraries.

3. **Stage 2: Number & Abbreviation Normalization**
   * **Tool**: `AbbreviationManager` (Custom) or NVIDIA NeMo
   * **Action**: Expand abbreviations ("Dr." -> "Doctor") and convert numbers to words if your specific TTS model requires it.

4. **Stage 3: The Splitter (Sentence Segmentation)**
   * **Tool**: `PySBD`
   * **Action**: Safely split the cleaned text into individual sentences. This is critical so your TTS audio doesn't abruptly cut off mid-thought due to a false sentence boundary.

### Summary
By stacking **ftfy -> Custom Regex -> PySBD**, you get a pipeline that is lightweight, highly accurate, deterministic, and easy to unit test. Avoid pulling in heavy libraries (like spaCy or TextHero) if you only need basic URL removal or sentence splitting for a web worker.
