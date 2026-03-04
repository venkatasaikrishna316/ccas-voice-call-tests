# How to Run and Check Tests

## Prerequisites
- Node.js >= 18.10.0 ✅ (You have v23.11.0)
- npm >= 9.1.0 ✅ (You have 10.9.2)
- Dependencies installed ✅

## Running Tests

### Option 1: Using npm script (Recommended)
```bash
npm test
```

### Option 2: Using Playwright directly
```bash
npx playwright test
```

### Option 3: Run specific test file
```bash
npx playwright test test-plans/playwright/CCASVoiceCall.spec.js
```

## Setting Environment Variables

Since we're using `process.env.username` and `process.env.password`, you can set them:

### On macOS/Linux:
```bash
export username="ria2@salesforce.com"
export password="123456"
npm test
```

### Or inline:
```bash
username="ria2@salesforce.com" password="123456" npm test
```

### Using .env file (if using dotenv):
Create a `.env` file:
```
username=ria2@salesforce.com
password=123456
```

## Verifying Configuration

### 1. Check config file structure:
```bash
cat workload-metadata/CCASVoiceCall.json | jq '.tasks[0].scripts[0].arguments'
```

### 2. Verify test file exists:
```bash
ls -la test-plans/playwright/CCASVoiceCall.spec.js
```

### 3. Verify audio file exists:
```bash
ls -la test-plans/test-asset/roleplay_padded_30secSilence.wav
```

### 4. Check Playwright config:
```bash
cat playwright.config.js
```

## Running with Different Metadata Files

The test script can use different workload metadata files. By default, it uses `CCASVoiceCall.json`, but you can specify a different file:

### Option 1: Using Environment Variable (Recommended)
```bash
# Set the metadata file
export METADATA_FILE=CCASVoiceCallOMT4.json

# Set credentials (optional - will use values from JSON if not set)
export username="outbound_user_1770010834897@nativeorg.com"
export password="123456"

# Run the test
npm test
```

### Option 2: Inline (One-liner)
```bash
METADATA_FILE=CCASVoiceCallOMT4.json username="outbound_user_1770010834897@nativeorg.com" password="123456" npm test
```

### Option 3: Using Playwright directly
```bash
METADATA_FILE=CCASVoiceCallOMT4.json npx playwright test
```

### Available Metadata Files
- `CCASVoiceCall.json` (default) - Uses server: `dfif000000c2oeae.perf3w`
- `CCASVoiceCallOMT4.json` - Uses server: `260omt4org1.perf3c`

### Verify which file is being used
When you run the test, you'll see:
```
✅ Loaded metadata file: CCASVoiceCallOMT4.json
```
This confirms which metadata file was loaded.

## Running with FPSx

When running with FPSx, it will:
1. Read the workload metadata file specified in FPSx (via `METADATA_FILE` env var or FPSx configuration)
2. Inject `username` and `password` as environment variables
3. Pass other arguments from the `arguments` section
4. Execute the test script

To run `CCASVoiceCallOMT4.json` in FPSx, specify it in your FPSx workload configuration.

## Troubleshooting

### If you see module resolution errors:
- Make sure `hps-playwright-core` is installed: `npm list hps-playwright-core`
- If it's a private package, ensure you're authenticated to the npm registry

### If credentials fail:
- Check that `process.env.username` and `process.env.password` are set
- Fallback to config file values if env vars not set

### If audio file not found:
- Verify path: `test-plans/test-asset/roleplay_padded_30secSilence.wav`
- Check file exists: `ls -la test-plans/test-asset/`
