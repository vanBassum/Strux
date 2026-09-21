#include "Authenticator.h"
#include <cstring>
#include <esp_log.h>

// ──────────────────────────────────────────────────────────────
// Auth — the credential authority. Nothing above the transport
// edge (commands, streams) ever sees a token or password.
// ──────────────────────────────────────────────────────────────

void Authenticator::Init()
{
    password_.Get(passwordSnapshot_, sizeof(passwordSnapshot_));
}

void Authenticator::CheckPasswordEpoch()
{
    LOCK(authMutex_);
    char current[64] = {};
    password_.Get(current, sizeof(current));
    if (strcmp(current, passwordSnapshot_) != 0)
    {
        ESP_LOGI(TAG, "password changed - clearing all channels");
        tokens_.Clear();
        strlcpy(passwordSnapshot_, current, sizeof(passwordSnapshot_));
    }
}

bool Authenticator::ValidateKey(const char* key)
{
    CheckPasswordEpoch();
    return tokens_.Touch(key);
}

void Authenticator::TouchKey(const char* key)
{
    tokens_.Touch(key);
}

bool Authenticator::AuthRequired()
{
    char pw[64] = {};
    password_.Get(pw, sizeof(pw));
    return pw[0] != '\0';
}

bool Authenticator::CheckPassword(const char* pw)
{
    CheckPasswordEpoch();
    char expected[64] = {};
    password_.Get(expected, sizeof(expected));
    return strcmp(pw ? pw : "", expected) == 0;
}

void Authenticator::MintKey(char* out)
{
    tokens_.Create(out);
}
