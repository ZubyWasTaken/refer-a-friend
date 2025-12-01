/**
 * Application-wide constants
 * Centralizes magic numbers for easier maintenance and understanding
 */

// Time constants (in milliseconds)
const TIME = {
    // Invite tracking
    DELETED_INVITE_MATCH_WINDOW: 5000,        // 5 seconds - window to match deleted invites to member joins
    DELETED_INVITE_CACHE_MAX_AGE: 30000,      // 30 seconds - how long to keep deleted invites in cache
    DELETED_INVITE_CLEANUP_INTERVAL: 5 * 60 * 1000,  // 5 minutes - how often to clean deleted invite cache

    // Logging
    LOG_CLEANUP_INTERVAL: 24 * 60 * 60 * 1000,  // 24 hours - how often to clean old logs
    LOG_RETENTION_DAYS: 30,                     // 30 days - how long to keep log files
};

// Export all constants
module.exports = {
    TIME
};
