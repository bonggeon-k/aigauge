# Plugin Guide

## Manifest Format

`plugins/<id>.toml`

```toml
id = "custom-provider"
name = "Custom Provider"
version = "1.0.0"
author = "Your Name"
description = "Tracks usage from custom endpoint"
auth_method = "api_key" # api_key | oauth | token | none
api_endpoint = "https://api.example.com/usage"
```

## Auth Methods

- `api_key`
- `oauth`
- `token`
- `none`

## Endpoint Requirements

- Use HTTPS in production.
- Return JSON payload parseable by plugin adapter.
- Avoid embedding secrets in URL query where possible.

## Testing

1. Place manifest in plugin directory.
2. Launch app and open Settings > Plugins.
3. Save credential with provider id.
4. Verify plugin request succeeds without leaking credential values.
