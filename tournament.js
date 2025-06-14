const fs = require("fs");
const path = require("path");

const GRID_SIZE = 10;
const MAX_TICKS = 90;
const TICK_DELAY = 100;
const playersDir = path.join(__dirname, "players");
const globalScorePath = path.join(__dirname, 'global_scores.json');
const logFilePath = path.join(__dirname, 'match_log.csv');

function loadGlobalScores() {
    if (!fs.existsSync(globalScorePath)) {
        fs.writeFileSync(globalScorePath, JSON.stringify({}));
    }
    let raw = fs.readFileSync(globalScorePath, 'utf8');
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error("❌ Fout bij laden global_scores.json, bestand is mogelijk corrupt.");
        return {};
    }
}

function saveGlobalScores(globalScores) {
    fs.writeFileSync(globalScorePath, JSON.stringify(globalScores, null, 2));
}

if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, `timestamp,toernooi,hider,seeker,result_hider,result_seeker,obstacles\n`);
}

const playerFiles = fs.readdirSync(playersDir).filter(f => f.endsWith(".js"));
let seekerWins = {}, hiderSurvived = {}, gamesPlayed = {};

playerFiles.forEach(p => {
    seekerWins[p] = 0;
    hiderSurvived[p] = 0;
    gamesPlayed[p] = 0;
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createObstacles() {
    return [...Array(5)].map(() => ({
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
    }));
}

function checkCollision(pos, obstacles) {
    return (
        pos.x < 0 || pos.x >= GRID_SIZE || pos.y < 0 || pos.y >= GRID_SIZE ||
        obstacles.some(o => o.x === pos.x && o.y === pos.y)
    );
}

function movePlayer(pos, dir) {
    let newPos = { ...pos };
    if (dir === "left") newPos.x -= 1;
    if (dir === "right") newPos.x += 1;
    if (dir === "up") newPos.y -= 1;
    if (dir === "down") newPos.y += 1;
    return newPos;
}

function detectWalls(pos) {
    return {
        left: pos.x <= 0,
        right: pos.x >= GRID_SIZE - 1,
        up: pos.y <= 0,
        down: pos.y >= GRID_SIZE - 1,
    };
}

function detectObstacles(pos, obstacles) {
    const directions = ["left", "right", "up", "down"];
    const check = dir => {
        let newPos = movePlayer(pos, dir);
        return checkCollision(newPos, obstacles);
    };
    return Object.fromEntries(directions.map(d => [d, check(d)]));
}

function clearScreen() {
    process.stdout.write("\u001b[H\u001b[2J");
}

function drawGrid(hider, seeker, obstacles, tick, phase, matchInfo, globalScores) {
    clearScreen();
    console.log(`🎮 ${matchInfo}`);
    console.log(`Tick ${tick} (${phase})`);

    for (let y = 0; y < GRID_SIZE; y++) {
        let row = "";
        for (let x = 0; x < GRID_SIZE; x++) {
            if (hider.x === x && hider.y === y) row += "H";
            else if (seeker.x === x && seeker.y === y) row += "S";
            else if (obstacles.some(o => o.x === x && o.y === y)) row += "■";
            else row += ".";
        }
        console.log(row);
    }

    console.log("\n🏆 Scoreboard:");
    console.log("Speler         | Wins als Zoeker | Overleefd als Hider  | Gespeeld");
    const sorted = Object.entries(seekerWins).sort((a, b) =>
        (b[1] + hiderSurvived[b[0]]) - (a[1] + hiderSurvived[a[0]])
    );
    for (const [name] of sorted) {
        console.log(`${name.padEnd(15)}| ${seekerWins[name].toString().padStart(15)} | ${hiderSurvived[name].toString().padStart(20)} | ${gamesPlayed[name]}`);
    }

    console.log("\n🌍 Totale statistieken over alle toernooien:");
    console.log("Speler         | Wins als Zoeker | Overleefd als Hider  | Gespeeld");
    const sortedGlobal = Object.entries(globalScores).sort((a, b) =>
        (b[1].seekerWins + b[1].hiderSurvived) - (a[1].seekerWins + a[1].hiderSurvived)
    );
    for (const [name, data] of sortedGlobal) {
        console.log(`${name.padEnd(15)}| ${data.seekerWins.toString().padStart(15)} | ${data.hiderSurvived.toString().padStart(20)} | ${data.gamesPlayed}`);
    }
}

async function runMatch(hiderFile, seekerFile, matchLabel, obstacles, globalScores) {
    const hiderModule = require(path.join(playersDir, hiderFile));
    const seekerModule = require(path.join(playersDir, seekerFile));

    if (!hiderModule.hider || !seekerModule.seeker) return "FOUT";

    const hiderLogic = hiderModule.hider;
    const seekerLogic = seekerModule.seeker;

    let hider = { x: 0, y: 0 };
    let seeker = { x: GRID_SIZE - 1, y: GRID_SIZE - 1 };
    let remaining = MAX_TICKS;
    let hidingPhase = true;

    for (let tick = 0; tick < MAX_TICKS; tick++) {
        if (hidingPhase && tick >= 10) hidingPhase = false;

        const actor = hidingPhase ? hider : seeker;
        const logic = hidingPhase ? hiderLogic : seekerLogic;

        const moveFn = dir => {
            const newPos = movePlayer(actor, dir);
            if (!checkCollision(newPos, obstacles)) {
                if (hidingPhase) hider = newPos;
                else seeker = newPos;
            }
        };

        try {
            logic(
                () => detectWalls(actor),
                () => detectObstacles(actor, obstacles),
                () => remaining,
                moveFn
            );
        } catch {
            return "FOUT";
        }

        drawGrid(hider, seeker, obstacles, tick, hidingPhase ? "HIDING" : "SEEKING", matchLabel, globalScores);
        await sleep(TICK_DELAY);

        if (!hidingPhase && hider.x === seeker.x && hider.y === seeker.y) {
            return "SEEKER";
        }

        remaining--;
    }

    return "HIDER";
}

async function runTournament() {
    const tournamentId = `toernooi-${Date.now()}`;
    const obstacles = createObstacles();
    let globalScores = loadGlobalScores();
    let matchCount = 0;
    const totalMatches = playerFiles.length * (playerFiles.length - 1);

    for (let i = 0; i < playerFiles.length; i++) {
        for (let j = 0; j < playerFiles.length; j++) {
            if (i !== j) {
                const hider = playerFiles[i];
                const seeker = playerFiles[j];
                matchCount++;
                const label = `🏁 ${tournamentId} | Match ${matchCount}/${totalMatches}: ${hider} (H) vs ${seeker} (S)`;

                const result = await runMatch(hider, seeker, label, obstacles, globalScores);
                if (result === "SEEKER") seekerWins[seeker]++;
                else if (result === "HIDER") hiderSurvived[hider]++;

                const timestamp = new Date().toISOString();
                const resultHider = result === "HIDER" ? "survived" : "found";
                const resultSeeker = result === "SEEKER" ? "found" : "missed";
                const obstacleStr = JSON.stringify({ gridSize: GRID_SIZE, obstacles });
                const logLine = `${timestamp},${tournamentId},${hider},${seeker},${resultHider},${resultSeeker},"${obstacleStr}"\n`;
                fs.appendFileSync(logFilePath, logLine);

                gamesPlayed[hider]++;
                gamesPlayed[seeker]++;
                await sleep(800);
            }
        }
    }

    for (const player of playerFiles) {
        if (typeof globalScores[player] !== "object") {
            globalScores[player] = { seekerWins: 0, hiderSurvived: 0, gamesPlayed: 0 };
        }
        globalScores[player].seekerWins += seekerWins[player];
        globalScores[player].hiderSurvived += hiderSurvived[player];
        globalScores[player].gamesPlayed += gamesPlayed[player];
    }
    saveGlobalScores(globalScores);
}

runTournament();
