// RedMart skiing diversion
// By Paul "Joey" Clark <joeytwiddle@gmail.com>

var _ = require('underscore');

function readMap (filename, callback) {
    var readline = require('readline');
    var fs = require('fs');

    var lineReader = readline.createInterface({
        terminal: false,
        input: fs.createReadStream(filename),
    });

    var map = [];

    var firstLine = true;

    lineReader.on('line', function (line) {
        if (firstLine) {
            firstLine = false;
            var sizes = line.split(" ").map(Number);
            /*
            var width = sizes[0];
            var height = sizes[1];
            */
            // But we don't actually need these, since the data itself implies the size
            // In fact by not specifying a fixed width and height, we could potentially process sparse maps in future
        } else {
            map.push( line.split(" ").map(Number) );
        }
    });

    lineReader.on('close', function () {
        callback(map);
    });
}

/* createDataMap
 *
 * Creates a new 2D array, where each entry is now an object holding the x,y position and elevation of each box.
 * After processing, each object will also contain the maxDistance available from that node, and an array of goodDirections in which that distance can be reached.
 * CONSIDER: Instead of goodDirections, we could just store the actual objects for the neighbouring boxes, i.e. goodNeighbours.
 */
function createDataMap (map) {
    var dataMap = [];
    map.forEach(function (row, y) {
        var newRow = [];
        row.forEach(function (elevation, x) {
            newRow.push({
                x: x,
                y: y,
                elevation: elevation,
                //maxDistance: undefined,
                //goodDirections: undefined,
            });
        });
        dataMap.push(newRow);
    });
    return dataMap;
}

function getNeighbourInDirection (dataMap, box, direction) {
    var neighbourX = box.x + direction[0];
    var neighbourY = box.y + direction[1];
    return getBoxAt(dataMap, neighbourX, neighbourY);
}

// Basic 2d-array lookup, but also handles out-of-bounds
function getBoxAt (array2d, x, y) {
    var row = array2d[y];
    if (!row) {
        // Off map vertically (or a sparse row)
        return undefined;
    }
    var cell = row[x];
    return cell;
}

// CONSIDER: The next four functions, and a few above, all make use of dataMap, and pass it around.
// We could consider pulling these functions into a closure, so they can all access dataMap without having to pass it.

function processBox (box, dataMap) {
    // This will be the final value for this box if no neighbours can be visited.
    box.maxDistance = 0;

    const DIRECTIONS = [ [-1,0], [0,+1], [+1,0], [0,-1] ];

    // Look north, south, east and west
    DIRECTIONS.forEach(function (direction) {
        var neighbour = getNeighbourInDirection(dataMap, box, direction);

        // If there is a box in this direction, and it is downhill from this box
        if (neighbour && neighbour.elevation < box.elevation) {
            // Then it should already have a maxDistance
            var distanceViaNeighbour = neighbour.maxDistance + 1;

            // If this is our best so far, clear the list of good directions
            if (distanceViaNeighbour > box.maxDistance) {
                box.goodDirections = [];
                box.maxDistance = distanceViaNeighbour;
            }

            // If it is better or as good as our best so far, add this direction as a possibility
            if (distanceViaNeighbour >= box.maxDistance) {
                box.goodDirections.push( direction );
            }
        }
    });
}

function findBestStartPoints (dataMap) {
    var bestDistance = -1;
    var bestStartPoints = [];
    dataMap.forEach(function (row) {
        row.forEach(function (box) {
            if (box.maxDistance > bestDistance) {
                bestStartPoints = [];
            }
            if (box.maxDistance >= bestDistance) {
                bestDistance = box.maxDistance;
                bestStartPoints.push(box);
            }
        });
    });
    return bestStartPoints;
}

/* A recursive function to collect the results.
 * We want to consider the possibility that one box may have multiple paths of the same length.
 * Therefore a box does not always return just one path, but could return multiple paths.
 */
function getGoodPathsFromBox (dataMap, box) {
    // Is this the last box, i.e. no neighbours to visit from here?
    // With above algorithm, only the middle term actually needs to be tested, but best to be safe in case the algorithm changes in future!
    if (box && box.goodDirections && box.goodDirections.length > 0) {
        // There are one or more boxes we can ski to from here
        // We will gather all of their paths, and for each path add this box on the front
        var allGoodPathsFromThisBox = [];
        box.goodDirections.forEach(function (direction) {
            var neighbourBox = getNeighbourInDirection(dataMap, box, direction);
            // As stated above, each neighbour could return multiple paths
            var pathsFromNeighbour = getGoodPathsFromBox(dataMap, neighbourBox);
            pathsFromNeighbour.forEach(function (onePathFromNeighbour) {
                // Add the current box to the beginning of the path for the neighbouring box
                var pathIncludingThisBox = _.flatten([box, onePathFromNeighbour]);
                // And add that to the list of all paths from this box, which we will return
                allGoodPathsFromThisBox.push( pathIncludingThisBox );
            });
        });
        return allGoodPathsFromThisBox;
    } else {
        return [ box ];
    }
}

function getGoodPathsFromStartPoints (dataMap, startPoints) {
    var allPaths = [];
    startPoints.forEach(function (startPoint) {
        var paths = getGoodPathsFromBox(dataMap, startPoint);
        paths.forEach(function (path) {
            allPaths.push(path);
        });
    });
    return allPaths;
}

function addSteepness (path) {
    var startBox = path[0];
    var endBox = path[path.length - 1];
    var steepness = startBox.elevation - endBox.elevation;
    path.steepness = steepness;
}

function selectPathsWithGreatestSteepness (potentialPaths) {
    potentialPaths.forEach(addSteepness);
    // Each potentialPath now has a steepness property, despite being an array.  Sorry!
    var greatestSteepness = _.max( _.pluck(potentialPaths, 'steepness') );
    var steepestPaths = _.where(potentialPaths, { steepness: greatestSteepness });
    return steepestPaths;
}

// Used to display paths
function simplifyPath (path) {
    return _.pluck(path, 'elevation').join("-");
}

function processMap (map) {
    /* We will take a dynamic programming approach:
     * We will visit each of the boxes from the bottom of the mountain upwards.
     * For each box we will determine its maxDistance based on its neighbouring boxes.
     * Any neighbours lower down the mountain will already have been processed.
     * This approach means we can find the maxDistance for all boxes in linear time.
     */

    var dataMap = createDataMap(map);

    var boxesFromLowToHigh = _.flatten(dataMap).sort(function (a, b) {
        return a.elevation - b.elevation;
    });

    // Process each box, starting with those at the bottom of the mountain
    boxesFromLowToHigh.forEach(function (box) {
        processBox(box, dataMap);
    });

    // Get the box(es) with the longest distance
    var bestStartPoints = findBestStartPoints(dataMap);

    /* Now all that is left is to gather all the longest paths, and select the
     * steepest of them. */

    var potentialPaths = getGoodPathsFromStartPoints(dataMap, bestStartPoints);
    console.log("[find_longest_route.js] potentialPaths:", potentialPaths.map(simplifyPath));

    var steepestPaths = selectPathsWithGreatestSteepness(potentialPaths);
    console.log("[find_longest_route.js] steepestPaths:", steepestPaths.map(simplifyPath));

    // For the purposes of the exercise, assume there will be only one solution:
    var steepestPath = steepestPaths[0];
    console.log("[find_longest_route.js] Steepest path has length %s and drop %s", steepestPath.length, steepestPath.steepness);
}

var filename = process.argv[2];

readMap(filename, processMap);
