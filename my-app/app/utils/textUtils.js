/**
 * Truncates a string based on character and word limits.
 * @param {string} text - The text to truncate.
 * @param {number} charLimit - Maximum number of characters.
 * @param {number} wordLimit - Maximum number of words.
 * @returns {string} Truncated text with ellipsis if needed.
 */
export function truncateText(text, charLimit = 16, wordLimit = 3) {
    if (!text) return '';

    const words = text.trim().split(/\s+/);
    let truncatedLabel = text;
    let isTruncated = false;

    // 1. Word limit check
    if (words.length > wordLimit) {
        truncatedLabel = words.slice(0, wordLimit).join(' ');
        isTruncated = true;
    }

    // 2. Character limit check (on whatever we have now)
    if (truncatedLabel.length > charLimit) {
        // If it was already word-truncated, we should still respect the char limit
        truncatedLabel = truncatedLabel.substring(0, charLimit).trim();
        isTruncated = true;
    }

    return isTruncated ? `${truncatedLabel}...` : text;
}
