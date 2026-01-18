// Field matching with case-insensitive string comparison
// Matches form fields to stored data using multiple strategies

class FieldMatcher {
    constructor(storedData) {
        this.storedData = storedData;
        this.normalizedKeys = {};

        // 1. Register simple stored keys
        for (const [key, value] of Object.entries(storedData)) {
            this.normalizedKeys[this.normalizeFieldName(key)] = key;
        }

        // 2. Register Smart Aliases (Synonyms)
        // If the user has these keys, also match against these common sentence patterns
        const COMMON_ALIASES = {
            'current_ctc': ['current_salary', 'present_salary', 'current_compensation', 'current_remuneration', 'current_package'],
            'expected_ctc': ['expected_salary', 'salary_expectation', 'expected_compensation', 'expected_package'],
            'ctc': ['salary', 'compensation', 'remuneration', 'package', 'pay'],
            'source': ['how_did_you_hear', 'where_did_you_hear', 'hear_about', 'found_this_job', 'referral'],
            'notice_period': ['notice_days', 'how_soon_can_you_join', 'earliest_start_date', 'joining_period'],
            'country_code': ['dial_code', 'isd_code', 'mobile_code'],
            'relocate': ['willing_to_relocate', 'open_to_relocate']
        };

        for (const [realKey, aliases] of Object.entries(COMMON_ALIASES)) {
            // Check if user actually has this key stored (e.g. 'source')
            // Or if they have a key that *contains* this key (like 'my_source')
            const matchingUserKey = Object.keys(storedData).find(k =>
                this.normalizeFieldName(k).includes(realKey) || realKey.includes(this.normalizeFieldName(k))
            );

            if (matchingUserKey) {
                // Register all aliases to point to this user key
                aliases.forEach(alias => {
                    this.normalizedKeys[this.normalizeFieldName(alias)] = matchingUserKey;
                });
            }
        }
    }

    normalizeFieldName(fieldName) {
        if (!fieldName) return '';

        // 1. Convert to lowercase
        let normalized = fieldName.toLowerCase();

        // 2. Explicitly remove wildcards (*) and separators (: ? [] ())
        normalized = normalized.replace(/[\*\:\?\(\)\[\]]/g, '');

        // 3. Replace separators with underscores
        normalized = normalized.replace(/[\s\-\.\/]+/g, '_');

        // 4. Remove special characters
        normalized = normalized.replace(/[^a-z0-9_]/g, '');

        // 5. Clean up underscores
        normalized = normalized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');

        return normalized;
    }

    removeCommonPrefixesSuffixes(fieldName) {
        const prefixes = ['input', 'field', 'form', 'user', 'applicant', 'candidate', 'txt', 'text', 'lbl', 'label'];
        const suffixes = [
            'input', 'field', 'box', 'text', 'value', 'data', 'id',
            'required', 'req', 'mandatory', 'optional', 'opt', 'star'
        ];

        const parts = fieldName.split('_');

        if (parts.length > 1 && prefixes.includes(parts[0])) {
            parts.shift();
        }

        if (parts.length > 1 && suffixes.includes(parts[parts.length - 1])) {
            parts.pop();
        }

        return parts.join('_');
    }

    calculateMatchScore(fieldName, storedKey, matchType) {
        const baseScores = {
            exact: 100,
            prefix: 85,
            suffix: 80,
            contains: 70,
            substring: 60
        };

        let score = baseScores[matchType] || 50;

        if (fieldName.length > 0) {
            const lengthRatio = storedKey.length / fieldName.length;
            if (lengthRatio > 0.5) score += 5;
            if (lengthRatio > 0.7) score += 5;
        }

        if (matchType === 'exact') score = 100;

        return Math.min(score, 100);
    }

    matchField(normalizedField) {
        let bestMatch = null;
        let bestScore = 0;

        for (const [normalizedKey, originalKey] of Object.entries(this.normalizedKeys)) {
            let matchType = null;

            if (normalizedField === normalizedKey) {
                matchType = 'exact';
            } else if (normalizedField.startsWith(normalizedKey + '_') ||
                (normalizedField.startsWith(normalizedKey) && normalizedKey.length >= 3)) {
                matchType = 'prefix';
            } else if (normalizedField.endsWith('_' + normalizedKey) ||
                (normalizedField.endsWith(normalizedKey) && normalizedKey.length >= 3)) {
                matchType = 'suffix';
            } else if (normalizedKey.length >= 3 && normalizedField.includes(normalizedKey)) {
                matchType = 'contains';
            } else if (normalizedField.length >= 3 && normalizedKey.includes(normalizedField)) {
                matchType = 'substring';
            }

            if (matchType) {
                const score = this.calculateMatchScore(normalizedField, normalizedKey, matchType);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = {
                        storedKey: originalKey,
                        matchType: matchType,
                        confidence: score
                    };
                }
            }
        }

        return bestMatch;
    }

    findMatch(fieldName, candidates = []) {
        const allCandidates = [fieldName, ...candidates];
        let bestMatch = null;
        let bestScore = 0;

        for (const candidate of allCandidates) {
            const normalized = this.normalizeFieldName(candidate);
            if (!normalized) continue;

            const variations = [normalized];
            const cleaned = this.removeCommonPrefixesSuffixes(normalized);
            if (cleaned !== normalized) {
                variations.push(cleaned);
            }

            for (const variation of variations) {
                const match = this.matchField(variation);
                if (match && match.confidence > bestScore) {
                    bestScore = match.confidence;
                    bestMatch = match;
                }
            }
        }

        return bestMatch;
    }

    getValue(storedKey) {
        return this.storedData[storedKey] || '';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldMatcher;
}
