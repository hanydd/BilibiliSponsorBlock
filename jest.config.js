module.exports = {
    "roots": [
        "test"
    ],
    "setupFiles": [
        "<rootDir>/test/setupPolyfills.js"
    ],
    "transform": {
        "^.+\\.tsx?$": "ts-jest"
    },
    "reporters": ["default", "github-actions"]
};
