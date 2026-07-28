const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    guild_id: { type: String, required: true },
    role_id: { type: String, required: true },
    invites_remaining: {
        type: Number,
        required: true,
        validate: {
            validator: value => (
                Number.isInteger(value) &&
                (value === -1 || value >= 0)
            ),
            message: 'invites_remaining must be -1 or a non-negative integer'
        }
    },
    created_at: { type: Date, default: Date.now }
});

const inviteSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    guild_id: { type: String, required: true },
    link: { type: String, required: true },
    invite_code: { type: String, required: true },
    max_uses: { type: Number, required: true, min: 0 },
    debited_role_id: { type: String, default: null },
    active: { type: Boolean, default: true },
    deletion_requested_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now }
});

const roleSchema = new mongoose.Schema({
    role_id: { type: String, required: true },
    guild_id: { type: String, required: true },
    name: { type: String, required: true },
    max_invites: {
        type: Number,
        required: true,
        validate: {
            validator: value => (
                Number.isInteger(value) &&
                (value === -1 || value > 0)
            ),
            message: 'max_invites must be -1 or a positive integer'
        }
    }
});

const joinTrackingSchema = new mongoose.Schema({
    invite_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invite',
        required: true
    },
    guild_id: { type: String, required: true },
    joined_user_id: { type: String, required: true },
    joined_at: { type: Date, default: Date.now }
});

const serverConfigSchema = new mongoose.Schema({
    guild_id: { type: String, required: true },
    logs_channel_id: { type: String, required: true },
    bot_channel_id: { type: String, required: true },
    setup_completed: { type: Boolean, default: false },
    default_invite_role: { type: String, default: null }
});

userSchema.index({ user_id: 1, guild_id: 1, role_id: 1 }, { unique: true });
userSchema.index({ guild_id: 1 });
inviteSchema.index({ invite_code: 1, guild_id: 1 }, { unique: true });
inviteSchema.index({ user_id: 1, guild_id: 1, active: 1 });
inviteSchema.index({ guild_id: 1, active: 1 });
roleSchema.index({ role_id: 1, guild_id: 1 }, { unique: true });
roleSchema.index({ guild_id: 1 });
joinTrackingSchema.index({ invite_id: 1, guild_id: 1 });
joinTrackingSchema.index({ joined_user_id: 1, guild_id: 1 });
joinTrackingSchema.index({ guild_id: 1 });
serverConfigSchema.index({ guild_id: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Invite = mongoose.model('Invite', inviteSchema);
const Role = mongoose.model('Role', roleSchema);
const JoinTracking = mongoose.model('JoinTracking', joinTrackingSchema);
const ServerConfig = mongoose.model('ServerConfig', serverConfigSchema);

module.exports = { User, Invite, Role, JoinTracking, ServerConfig };
