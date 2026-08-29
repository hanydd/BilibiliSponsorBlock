// ==UserScript==
// @name         BilibiliSponsorBlock
// @namespace    https://github.com/hanydd/BilibiliSponsorBlock
// @version      0.8.5
// @description  Bilibili SponsorBlock - 跳过B站恰饭片段
// @author       hanydd (https://github.com/hanydd)
// @license      GPL-3.0
// @match        https://*.bilibili.com/video/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @connect      bsbsb.top
// @run-at       document-start
// ==/UserScript==

/**
 * BilibiliSponsorBlock Userscript
 *
 * This userscript provides sponsor segment skipping functionality for Bilibili videos
 * by implementing a cross-platform Tampermonkey script that works on Chrome, Firefox, Safari, and other browsers.
 *
 * Main Features:
 * - Automatically skips sponsor segments in Bilibili videos
 * - Supports multiple segment categories (sponsor, self-promo, interaction, etc.)
 * - Cross-platform compatibility through Tampermonkey
 *
 * Architecture:
 * - Uses GM_xmlhttpRequest for API communication
 * - Implements segment detection and automatic skipping
 * - Handles single-page application navigation
 */

(function () {
    "use strict";

    // =============================================================================
    // HTTP REQUEST WRAPPER
    // =============================================================================

    /**
     * HTTP request wrapper using GM_xmlhttpRequest
     * Provides fetch-like interface for making API requests
     * @param {string} method - HTTP method (GET, POST, etc.)
     * @param {string} url - Request URL
     * @param {Object|string} data - Request data
     * @returns {Promise} Promise resolving to response object
     */
    function makeRequest(method, url, data) {
        return new Promise((resolve, reject) => {
            const details = {
                method: method,
                url: url,
                onload: function (response) {
                    // Create fetch-like response object
                    resolve({
                        ok: response.status >= 200 && response.status < 300,
                        status: response.status,
                        text: () => Promise.resolve(response.responseText),
                        json: () => Promise.resolve(JSON.parse(response.responseText)),
                    });
                },
                onerror: function (error) {
                    reject(error);
                },
            };

            if (method.toUpperCase() !== "GET" && data) {
                details.data = typeof data === "string" ? data : JSON.stringify(data);
                details.headers = {
                    "Content-Type": "application/json",
                };
            }

            GM_xmlhttpRequest(details);
        });
    }

    // =============================================================================
    // CONFIGURATION SYSTEM
    // =============================================================================

    /**
     * Configuration management class
     * Handles userscript settings and category preferences
     */
    class UserscriptConfig {
        constructor() {
            this.loadDefaults();
        }

        /**
         * Load default configuration values
         * Sets up server address and category skip preferences
         */
        loadDefaults() {
            // Configuration with server address and category skip settings
            this.config = {
                // Server configuration
                serverAddress: "https://bsbsb.top",

                // Category skip settings - determines which segment types to skip
                categorySelections: {
                    sponsor: { skip: true }, // 赞助商片段
                    selfpromo: { skip: true }, // 自我推广
                    interaction: { skip: true }, // 互动提醒
                    intro: { skip: false }, // 开场
                    outro: { skip: false }, // 结尾
                    preview: { skip: false }, // 预览
                    music_offtopic: { skip: false }, // 音乐片段
                    filler: { skip: false }, // 填充内容
                },
            };
        }

        /**
         * Get configuration value
         * @param {string} key - Configuration key
         * @returns {*} Configuration value
         */
        get(key) {
            return this.config[key];
        }
    }

    // Initialize global configuration instance
    const Config = new UserscriptConfig();

    // =============================================================================
    // PAGE DETECTION UTILITIES
    // =============================================================================

    /**
     * Extract Bilibili video ID from current URL
     * @returns {string|null} Video ID (BVID) or null if not found
     */
    function getBilibiliVideoID() {
        // Match different Bilibili URL patterns
        const patterns = [
            /\/video\/([^/?#]+)/, // /video/BV1234567890
            /\/BV([^/?#]+)/, // /BV1234567890
            /bvid=([^&]+)/, // ?bvid=BV1234567890
        ];

        const url = window.location.href;
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                let videoId = match[1];
                // Ensure BV prefix
                if (!videoId.startsWith("BV")) {
                    videoId = "BV" + videoId;
                }
                return videoId;
            }
        }
        return null;
    }

    // =============================================================================
    // HASHING UTILITY
    // =============================================================================

    /**
     * SHA-256 hash function using Web Crypto API
     * @param {string} value - String to hash
     * @returns {Promise<string>} Hash string in hexadecimal format
     */
    async function sha256Hash(value) {
        try {
            // Check if crypto.subtle is available (required for hash functions)
            if (!crypto || !crypto.subtle) {
                console.error("[BSB] crypto.subtle is not available. Hash functions will not work.");
                return value; // Fallback to original value
            }

            const encoder = new TextEncoder();
            const data = encoder.encode(value);
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        } catch (error) {
            console.error("[BSB] Error hashing value:", error);
            return value; // Fallback to original value
        }
    }

    /**
     * Get video ID hash for API requests
     * @param {string} videoID - Video ID to hash
     * @returns {Promise<string>} Hashed video ID
     */
    async function getVideoIDHash(videoID) {
        return await sha256Hash(videoID);
    }

    // =============================================================================
    // SEGMENT SKIPPING FUNCTIONALITY
    // =============================================================================

    /**
     * Main class for handling segment detection and skipping
     * Manages video segment loading, detection, and automatic skipping
     */
    class SegmentSkipper {
        constructor() {
            console.log("[BSB] SegmentSkipper instance created.");
            this.segments = []; // Array of skip segments for current video
            this.currentVideo = null; // Current video ID being processed
            this.videoElement = null; // Reference to HTML video element
            this.lastCheckedTime = 0; // Last time we checked for skipping (performance optimization)
        }

        /**
         * Load skip segments for a specific video from the API
         * @param {string} videoID - Bilibili video ID (BVID)
         */
        async loadSegments(videoID) {
            if (!videoID) return;

            console.log(`[BSB] Loading segments for video: ${videoID}`);
            try {
                // Hash the video ID and get first 4 characters for API request
                const videoIDHash = await getVideoIDHash(videoID);
                const hashPrefix = videoIDHash.slice(0, 4);

                console.log(`[BSB] Using hash prefix: ${hashPrefix} for video: ${videoID}`);

                // Make API request to get skip segments using hash prefix
                const response = await makeRequest(
                    "GET",
                    `${Config.get("serverAddress")}/api/skipSegments/${hashPrefix}`
                );

                if (response.ok) {
                    const allSegments = await response.json();
                    console.log("[BSB] API response received:", allSegments);

                    // Filter segments for this specific video ID
                    this.segments = [];
                    for (const segmentResponse of allSegments) {
                        if (segmentResponse.videoID === videoID && segmentResponse.segments) {
                            // Filter segments by enabled categories and action types
                            const filteredSegments = segmentResponse.segments.filter((segment) => {
                                const categorySettings = Config.get("categorySelections")[segment.category];
                                const enabledActionTypes = ["skip", "poi"]; // ActionType.Skip, ActionType.Poi

                                return (
                                    categorySettings &&
                                    categorySettings.skip &&
                                    enabledActionTypes.includes(segment.actionType)
                                );
                            });

                            this.segments = filteredSegments;
                            break;
                        }
                    }

                    console.log("[BSB] Segments loaded and filtered:", this.segments);
                } else {
                    console.error(`[BSB] Failed to load segments. Status: ${response.status}`);
                    this.segments = [];
                }
            } catch (error) {
                console.error("[BSB] Error loading segments:", error);
                this.segments = [];
            }
        }

        /**
         * Check if current video time is within any skip segment
         * Called repeatedly during video playback via timeupdate event
         */
        checkForSkip() {
            // Don't check if no video element or segments available
            if (!this.videoElement || this.segments.length === 0) return;

            const currentTime = this.videoElement.currentTime;

            // Performance optimization: only check every 0.5 seconds
            // This prevents excessive processing while maintaining accuracy
            if (Math.abs(currentTime - this.lastCheckedTime) < 0.5) return;
            this.lastCheckedTime = currentTime;

            // Check each segment to see if we should skip
            for (const segment of this.segments) {
                const [startTime, endTime] = segment.segment;
                const category = segment.category;

                // Check if user has enabled skipping for this category
                const categorySettings = Config.get("categorySelections")[category];
                if (!categorySettings?.skip) continue;

                // Check if current playback time is within this segment
                if (currentTime >= startTime && currentTime < endTime) {
                    console.log(
                        `[BSB] Skipping ${category} segment: ${this.formatTime(startTime)} - ${this.formatTime(
                            endTime
                        )}`
                    );
                    this.skipToTime(endTime);
                    break; // Only skip one segment at a time
                }
            }
        }

        /**
         * Skip video to specified time
         * @param {number} time - Time in seconds to skip to
         */
        skipToTime(time) {
            if (this.videoElement) {
                this.videoElement.currentTime = time;
                console.log(`[BSB] Skipped to: ${this.formatTime(time)}`);
            }
        }

        /**
         * Format time duration in MM:SS format
         * @param {number} seconds - Duration in seconds
         * @returns {string} Formatted time string
         */
        formatTime(seconds) {
            const min = Math.floor(seconds / 60);
            const sec = Math.floor(seconds % 60);
            return `${min}:${sec.toString().padStart(2, "0")}`;
        }

        /**
         * Initialize the segment skipper
         * Sets up video element detection and event listeners
         */
        init() {
            console.log("[BSB] Initializing segment skipper...");
            // Function to check for video element periodically
            const checkForVideo = () => {
                // Try multiple video selectors to find the video element
                this.videoElement =
                    document.querySelector("video") ||
                    document.querySelector(".bpx-player-video-area video") ||
                    document.querySelector(".bilibili-player video");

                if (this.videoElement) {
                    console.log("[BSB] Video element found, setting up event listeners.");
                    // Remove existing event listeners to avoid duplicates
                    this.videoElement.removeEventListener("timeupdate", this.checkForSkip);

                    // Add timeupdate event listener to check for segments to skip
                    this.videoElement.addEventListener("timeupdate", () => {
                        this.checkForSkip();
                    });

                    // Load segments when video changes
                    const videoID = getBilibiliVideoID();
                    if (videoID && videoID !== this.currentVideo) {
                        this.currentVideo = videoID;
                        this.loadSegments(videoID);
                    }
                } else {
                    // Video element not found, try again in 1 second
                    setTimeout(checkForVideo, 1000);
                }
            };

            // Start checking for video element
            checkForVideo();
        }
    }

    // =============================================================================
    // MAIN INITIALIZATION
    // =============================================================================

    /**
     * Initialize the userscript
     * Main entry point that sets up all functionality
     */
    function init() {
        console.log("[BSB] BilibiliSponsorBlock userscript starting...");
        console.log("[BSB] Current URL:", window.location.href);
        console.log("[BSB] Configuration:", Config.config);

        // Extract video ID from current page
        const videoID = getBilibiliVideoID();
        console.log(`[BSB] Video ID detected: ${videoID}`);

        // Test crypto availability
        if (!crypto || !crypto.subtle) {
            console.error("[BSB] WARNING: crypto.subtle not available. Userscript may not work correctly.");
        } else {
            console.log("[BSB] crypto.subtle available.");
        }

        // Initialize segment skipper
        const skipper = new SegmentSkipper();
        skipper.init();

        // Handle page navigation for Single Page Application (SPA)
        let currentURL = window.location.href;

        const handleNavigation = () => {
            if (window.location.href !== currentURL) {
                currentURL = window.location.href;
                console.log(`[BSB] Navigation detected. New URL: ${currentURL}`);
                // Reinitialize skipper after navigation
                setTimeout(() => {
                    skipper.init();
                }, 1000);
            }
        };

        // Listen for popstate events (back/forward navigation)
        window.addEventListener("popstate", handleNavigation);

        // Check for URL changes periodically for SPA navigation
        setInterval(handleNavigation, 3000);
    }

    // =============================================================================
    // USERSCRIPT STARTUP
    // =============================================================================

    // Wait for DOM to be ready before initializing
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        // DOM is already ready, initialize immediately
        init();
    }
})();
