#pragma once

#include <cstdint>
#include <cstdarg>
#include <cstring>
#include <cstdlib>
#include <cstdio>

// ──────────────────────────────────────────────────────────────
// Fixed-capacity buffer for building JSON responses (no heap)
// ──────────────────────────────────────────────────────────────

struct FixBuf {
    char* data;
    int32_t len = 0;
    int32_t cap;

    FixBuf(char* buf, int32_t capacity) : data(buf), cap(capacity) { data[0] = '\0'; }

    FixBuf(const FixBuf&) = delete;
    FixBuf& operator=(const FixBuf&) = delete;

    int32_t remaining() const { return cap - 1 - len; }

    void append(const char* s, int32_t n = -1)
    {
        if (n < 0) n = static_cast<int32_t>(strlen(s));
        int32_t avail = remaining();
        if (n > avail) n = avail;
        if (n <= 0) return;
        memcpy(data + len, s, n);
        len += n;
        data[len] = '\0';
    }

    void appendf(const char* fmt, ...) __attribute__((format(printf, 2, 3)))
    {
        int32_t avail = remaining();
        if (avail <= 0) return;
        va_list args;
        va_start(args, fmt);
        int32_t written = vsnprintf(data + len, avail + 1, fmt, args);
        va_end(args);
        if (written > 0)
            len += (written > avail) ? avail : written;
    }
};

// ──────────────────────────────────────────────────────────────
// JSON parsing helpers
// ──────────────────────────────────────────────────────────────

inline bool ExtractJsonString(const char* json, const char* field, char* out, size_t outSize)
{
    char pattern[32];
    snprintf(pattern, sizeof(pattern), "\"%s\"", field);
    const char* pos = strstr(json, pattern);
    if (!pos) return false;
    pos = strchr(pos + strlen(pattern), ':');
    if (!pos) return false;
    pos++;
    while (*pos == ' ' || *pos == '\t') pos++;
    if (*pos != '"') return false;
    pos++;
    size_t i = 0;
    while (*pos && *pos != '"' && i < outSize - 1)
    {
        if (*pos == '\\' && *(pos + 1)) pos++;
        out[i++] = *pos++;
    }
    out[i] = '\0';
    return true;
}

inline int32_t ExtractJsonInt(const char* json, const char* field, int32_t defaultVal = 0)
{
    char pattern[32];
    snprintf(pattern, sizeof(pattern), "\"%s\"", field);
    const char* pos = strstr(json, pattern);
    if (!pos) return defaultVal;
    pos = strchr(pos + strlen(pattern), ':');
    if (!pos) return defaultVal;
    pos++;
    while (*pos == ' ' || *pos == '\t') pos++;
    if (*pos == 'n') return defaultVal; // null
    return static_cast<int32_t>(atoi(pos));
}
