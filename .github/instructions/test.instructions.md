---
applyTo: '**/*'
---

# Test Instructions
- when running tests, ensure using command `npm test > test.log 2>&1` to capture all output, including errors.
- wait for the tests to complete before checking the `test.log` file.
- do not run tests in parallel or concurrently, as this may lead to race conditions and flaky tests.
- after running tests, check the `test.log` file for any errors or issues.
- if there are any errors, they should be reported in the `test.log` file.
- do not suggest code that has been deleted or is not present in the current context.

# Build Instructions
- when building the project, ensure to use the command `npm run build > build.log 2>&1` to capture all output, including errors.
- wait for the build to complete before checking the `build.log` file.
- do not run builds in parallel or concurrently, as this may lead to race conditions and inconsistent build artifacts.
- after building, check the `build.log` file for any errors or issues.
- if there are any errors, they should be reported in the `build.log` file.
- do not suggest code that has been deleted or is not present in the current context.