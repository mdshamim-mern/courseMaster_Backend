# Isolated browser verification support

These helpers run only against a dedicated database whose name ends in _test. They never run as part of the production server.

1. Set MONGODB_URI to an empty disposable local database such as mongodb://127.0.0.1:27017/coursemaster_browser_test.
2. Set COURSEMASTER_BROWSER_FIXTURES and COURSEMASTER_BROWSER_CONTROL to absolute paths for temporary JSON files outside the repositories. Initialize the control file with an empty JSON object.
3. From the backend directory, run node tests/browser-support/seed.cjs. It refuses a populated database and creates synthetic example.test accounts and ten test courses.
4. Run node tests/browser-support/server.cjs. The test wrapper listens only on 127.0.0.1:5001, uses the dedicated database, and supports controlled verification failures from the temporary control file.
5. Start the frontend with VITE_API_BASE_URL=http://127.0.0.1:5001/api and npm run dev -- --host 127.0.0.1 --port 5180 --strictPort.
6. In another terminal, set the same two COURSEMASTER_BROWSER variables and run npm run test:browser in the frontend directory. Installed Google Chrome is used in an isolated headless browser profile. Each scenario creates a new synthetic student account.

Optional variables: COURSEMASTER_BROWSER_URL changes the frontend URL. COURSEMASTER_BROWSER_API specifies the full registration endpoint. COURSEMASTER_BROWSER_EVIDENCE and COURSEMASTER_BROWSER_OUTPUT select output directories. Stop the helper servers when finished.
