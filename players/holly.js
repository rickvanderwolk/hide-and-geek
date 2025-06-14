exports.hider = function(detectWalls, detectObstacles, getRemainingTime, move) {
    const walls = detectWalls();
    if (!walls.down) move('down');
    else if (!walls.right) move('right');
};

exports.seeker = function(detectWalls, detectObstacles, getRemainingTime, move) {
    const walls = detectWalls();
    if (!walls.left) move('left');
    else if (!walls.up) move('up');
};
