async function startServices({ initDatabase, login }) {
    await initDatabase();
    await login();
}

module.exports = { startServices };
