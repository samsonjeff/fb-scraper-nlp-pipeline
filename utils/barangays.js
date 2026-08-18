/**
 * Official list of 21 barangays in Talisay, Batangas, Philippines.
 */
const BARANGAYS = [
    "Aya",
    "Balas",
    "Banga",
    "Buco",
    "Caloocan",
    "Leynes",
    "Miranda",
    "Poblacion Barangay 1",
    "Poblacion Barangay 2",
    "Poblacion Barangay 3",
    "Poblacion Barangay 4",
    "Poblacion Barangay 5",
    "Poblacion Barangay 6",
    "Poblacion Barangay 7",
    "Poblacion Barangay 8",
    "Quiling",
    "Sampaloc",
    "San Guillermo",
    "Santa Maria",
    "Tranca",
    "Tumaway"
];

/**
 * Incident keywords (Filipino + English).
 * Maps keyword patterns to canonical incident types.
 */
const INCIDENT_KEYWORDS = {
    "flood":       "flood",
    "baha":        "flood",
    "binaha":      "flood",
    "bumabaha":    "flood",
    "flash flood": "flood",
    "tubig":       "flood",

    "fire":        "fire",
    "sunog":       "fire",
    "nasunog":     "fire",
    "nasusunog":   "fire",

    "earthquake":  "earthquake",
    "lindol":      "earthquake",
    "lumindol":    "earthquake",

    "landslide":   "landslide",
    "guho":        "landslide",
    "pagguho":     "landslide",

    "casualty":    "casualty",
    "patay":       "casualty",
    "namatay":     "casualty",
    "sugatan":     "casualty",
    "nasugatan":   "casualty",
    "injured":     "casualty",
    "dead":        "casualty",
    "died":        "casualty",
    "death":       "casualty",

    "emergency":   "emergency",
    "emerhensya":  "emergency",
    "tulong":      "emergency",
    "rescue":      "emergency",
    "saklolo":     "emergency",

    "typhoon":     "typhoon",
    "bagyo":       "typhoon",
    "storm":       "typhoon",

    "accident":    "accident",
    "aksidente":   "accident",
    "nabangga":    "accident",
    "banggaan":    "accident",

    "evacuation":  "evacuation",
    "evacuate":    "evacuation",
    "lumikas":     "evacuation",
    "likas":       "evacuation"
};

/**
 * Detect a Talisay barangay name from free text.
 * Checks longest names first (e.g., "Poblacion Barangay 1" before "Barangay").
 * @param {string} text
 * @returns {string} Matched barangay name or "Unknown"
 */
function detectBarangay(text) {
    if (!text) return "Unknown";
    const lower = text.toLowerCase();

    // Sort by length descending so multi-word names match first
    const sorted = [...BARANGAYS].sort((a, b) => b.length - a.length);

    for (const brgy of sorted) {
        if (lower.includes(brgy.toLowerCase())) {
            return brgy;
        }
    }
    return "Unknown";
}

/**
 * Detect incident type from free text.
 * @param {string} text
 * @returns {string|null} Canonical incident type or null
 */
function detectIncidentType(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Sort keywords by length descending so "flash flood" matches before "flood"
    const sortedKeywords = Object.keys(INCIDENT_KEYWORDS)
        .sort((a, b) => b.length - a.length);

    for (const keyword of sortedKeywords) {
        if (lower.includes(keyword)) {
            return INCIDENT_KEYWORDS[keyword];
        }
    }
    return null;
}

module.exports = { BARANGAYS, detectBarangay, detectIncidentType, INCIDENT_KEYWORDS };
