const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    user_id: String,
    guild_id: String,
    role_id: String,
    invites_remaining: Number,
    created_at: { type: Date, default: Date.now }
});

const inviteSchema = new mongoose.Schema({
    user_id: String,
    guild_id: String,
    link: String,
    invite_code: String,
    max_uses: Number,
    created_at: { type: Date, default: Date.now }
});

const roleSchema = new mongoose.Schema({
    role_id: String,
    guild_id: String,
    name: String,
    max_invites: Number
});

const joinTrackingSchema = new mongoose.Schema({
    invite_id: mongoose.Schema.Types.ObjectId,
    guild_id: String,
    joined_user_id: String,
    joined_at: { type: Date, default: Date.now }
});

const serverConfigSchema = new mongoose.Schema({
    guild_id: String,
    logs_channel_id: String,
    bot_channel_id: String,
    system_channel_id: String,
    setup_completed: { type: Boolean, default: false },
    default_invite_role: { type: String, default: null }
});

userSchema.index({ user_id: 1, guild_id: 1, role_id: 1 }, { unique: true });
inviteSchema.index({ invite_code: 1, guild_id: 1 }, { unique: true });
roleSchema.index({ role_id: 1, guild_id: 1 }, { unique: true });
joinTrackingSchema.index({ invite_id: 1, guild_id: 1 });

const User = mongoose.model('User', userSchema);
const Invite = mongoose.model('Invite', inviteSchema);
const Role = mongoose.model('Role', roleSchema);
const JoinTracking = mongoose.model('JoinTracking', joinTrackingSchema);
const ServerConfig = mongoose.model('ServerConfig', serverConfigSchema);

module.exports = { User, Invite, Role, JoinTracking, ServerConfig }; 