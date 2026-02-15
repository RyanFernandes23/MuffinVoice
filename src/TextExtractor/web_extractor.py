"""
Webpage text extraction module for WikiVoice.
Supports extracting text from URLs using various methods:
- Static HTML extraction using trafilatura (fast, for most sites)
- Headless browser extraction using playwright (for JavaScript-rendered content)
- Custom CSS selector support for targeted extraction
"""

import asyncio
import os
import tempfile
import time
from typing import Optional
from urllib.parse import urlparse

import requests
from trafilatura import extract


class WebpageExtractor:
    """Extract text content from webpages."""

    def __init__(self, url: str):
        self.url = url
        self.domain = urlparse(url).netloc

    def validate_url(self) -> bool:
        """Validate URL format and accessibility."""
        try:
            result = urlparse(self.url)
            return all([result.scheme in ["http", "https"], result.netloc])
        except Exception:
            return False

    def _extract_static(self, timeout: int = 30) -> Optional[str]:
        """
        Extract text using static HTML (fast method).
        Uses trafilatura for intelligent content extraction.
        """
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
            }

            response = requests.get(
                self.url, headers=headers, timeout=timeout, allow_redirects=True
            )
            response.raise_for_status()

            # Use trafilatura for intelligent content extraction
            extracted_text = extract(
                response.text,
                include_comments=False,
                include_tables=False,
                include_images=False,
                include_links=False,
                deduplicate=True,
                target_language="en",
            )

            if extracted_text and len(extracted_text.strip()) > 100:
                return extracted_text.strip()
            return None

        except requests.exceptions.Timeout:
            raise TimeoutError(
                f"Request to {self.url} timed out after {timeout} seconds"
            )
        except requests.exceptions.RequestException as e:
            raise ConnectionError(f"Failed to fetch {self.url}: {str(e)}")
        except Exception as e:
            raise RuntimeError(f"Error extracting content from {self.url}: {str(e)}")

    async def _extract_dynamic(self, timeout: int = 60) -> Optional[str]:
        """
        Extract text using headless browser (for JavaScript-rendered content).
        Uses playwright if available, otherwise falls back to static extraction.
        """
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                # Set user agent
                await page.set_extra_http_headers(
                    {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                )

                # Navigate to page
                await page.goto(
                    self.url, wait_until="networkidle", timeout=timeout * 1000
                )

                # Wait for content to load
                await asyncio.sleep(2)

                # Get page content
                html_content = await page.content()
                await browser.close()

                # Extract text using trafilatura
                extracted_text = extract(
                    html_content,
                    include_comments=False,
                    include_tables=False,
                    include_images=False,
                    include_links=False,
                    deduplicate=True,
                    target_language="en",
                )

                if extracted_text and len(extracted_text.strip()) > 100:
                    return extracted_text.strip()
                return None

        except ImportError:
            # Playwright not installed
            return None
        except Exception as e:
            # Dynamic extraction failed
            return None

    def extract_with_selector(self, css_selector: str, timeout: int = 30) -> str:
        """
        Extract text using a specific CSS selector.
        Falls back to static extraction if selector fails.
        """
        try:
            from bs4 import BeautifulSoup

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            }

            response = requests.get(self.url, headers=headers, timeout=timeout)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            elements = soup.select(css_selector)

            if not elements:
                raise ValueError(f"No elements found with selector: {css_selector}")

            # Extract text from selected elements
            texts = []
            for element in elements:
                text = element.get_text(strip=True, separator="\n")
                if text:
                    texts.append(text)

            extracted_text = "\n\n".join(texts)

            if len(extracted_text.strip()) < 50:
                raise ValueError("Extracted content is too short")

            return extracted_text.strip()

        except ImportError:
            raise ImportError("beautifulsoup4 is required for CSS selector extraction")
        except Exception as e:
            raise RuntimeError(f"Selector extraction failed: {str(e)}")

    async def extract(
        self,
        use_dynamic: bool = True,
        css_selector: Optional[str] = None,
        timeout: int = 30,
    ) -> str:
        """
        Extract text from webpage with automatic fallback.

        Args:
            use_dynamic: Whether to try headless browser for JS content
            css_selector: Optional CSS selector for targeted extraction
            timeout: Request timeout in seconds

        Returns:
            Extracted text content

        Raises:
            ValueError: If URL is invalid
            ConnectionError: If webpage cannot be accessed
            RuntimeError: If extraction fails
        """
        if not self.validate_url():
            raise ValueError(f"Invalid URL: {self.url}")

        # Try CSS selector extraction first if provided
        if css_selector:
            try:
                return self.extract_with_selector(css_selector, timeout)
            except Exception as e:
                # Log and continue to automatic extraction
                print(
                    f"[WARN] Selector extraction failed: {e}, trying automatic extraction"
                )

        # Try static extraction first (faster)
        try:
            result = self._extract_static(timeout)
            if result:
                return result
        except Exception as e:
            print(f"[WARN] Static extraction failed: {e}")

        # Fallback to dynamic extraction if enabled
        if use_dynamic:
            try:
                result = await self._extract_dynamic(timeout=60)
                if result:
                    return result
            except Exception as e:
                print(f"[WARN] Dynamic extraction failed: {e}")

        raise RuntimeError(
            f"Failed to extract content from {self.url}. "
            "The page might be protected, require authentication, or have no extractable content."
        )

    def save_to_file(self, text: str, output_dir: str = "uploads") -> str:
        """
        Save extracted text to a file.
        Returns the path to the saved file.
        """
        os.makedirs(output_dir, exist_ok=True)

        # Create filename from URL domain and timestamp
        timestamp = int(time.time())
        safe_domain = "".join(c for c in self.domain if c.isalnum() or c in "-._")[:50]
        filename = f"{safe_domain}_{timestamp}.txt"
        filepath = os.path.join(output_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(text)

        return filepath


def extract_from_url(
    url: str,
    use_dynamic: bool = True,
    css_selector: Optional[str] = None,
    timeout: int = 30,
) -> str:
    """
    Convenience function to extract text from a URL.

    Args:
        url: The webpage URL to extract from
        use_dynamic: Whether to try headless browser for JS content
        css_selector: Optional CSS selector for targeted extraction
        timeout: Request timeout in seconds

    Returns:
        Extracted text content
    """
    extractor = WebpageExtractor(url)
    return asyncio.run(extractor.extract(use_dynamic, css_selector, timeout))


if __name__ == "__main__":
    # Test the extractor
    test_urls = [
        "https://en.wikipedia.org/wiki/Python_(programming_language)",
    ]

    for url in test_urls:
        print(f"\nTesting: {url}")
        try:
            extractor = WebpageExtractor(url)
            text = asyncio.run(extractor.extract())
            print(f"Extracted {len(text)} characters")
            print(f"Preview: {text[:200]}...")

            # Save to file
            filepath = extractor.save_to_file(text)
            print(f"Saved to: {filepath}")
        except Exception as e:
            print(f"Error: {e}")
