// RedMart skiing diversion
// By Paul "Joey" Clark <joeytwiddle@gmail.com>

var _ = require('underscore');

function readMap (filename, callback) {
    var readline = require('readline');
    var fs = require('fs');

    var lineReader = readline.createInterface({
        terminal: false,   /* Workaround an issue with isTTY in Node 0.10.3[78] and 0.12.0.  http://tinyurl.com/q898mm6 */
        input: fs.createReadStream(filename),
    });

    var mountainMap = [];

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
            mountainMap.push( line.split(" ").map(Number) );
        }
    });

    lineReader.on('close', function () {
        callback(mountainMap);
    });
}

/* createDataMap
 *
 * Creates a new 2D array, where each entry is now an object holding the x,y position and elevation of each box.
 * After processing, each object will also contain the maxDistance available from that node, and an array of goodDirections in which that distance can be reached.
 * CONSIDER: Instead of goodDirections, we could just store the actual objects for the neighbouring boxes, i.e. goodNeighbours.
 */
function createDataMap (mountainMap) {
    return mountainMap.map(function (row, y) {
        return row.map(function (elevation, x) {
            return {
                x: x,
                y: y,
                elevation: elevation,
                //maxDistance: undefined,
                //goodDirections: undefined,
            };
        });
    });
}

// CONSIDER: All of the next six functions make use of dataMap, and pass it around.
// We could consider pulling these functions into a closure, so they can all access dataMap without having to pass it.

function getNeighbourInDirection (dataMap, box, direction) {
    return getBoxAt(dataMap, box.x + direction[0], box.y + direction[1]);
}

// Basic 2d-array lookup, but also handles out-of-bounds
function getBoxAt (array2d, x, y) {
    var row = array2d[y];
    return row && row[x];
}

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

/* Collect all the paths below one box.
 * Each box may return multiple paths of the same length.
 */
function getGoodPathsFromBox (dataMap, box) {
    if (box.goodDirections) {
        // For each neighbour, get its paths and prepend this box to the front
        var routesForEachDirection = box.goodDirections.map(function (direction) {
            var neighbourBox = getNeighbourInDirection(dataMap, box, direction);
            var pathsFromNeighbour = getGoodPathsFromBox(dataMap, neighbourBox);
            return pathsFromNeighbour.map(function (onePathFromNeighbour) {
                // Add the current box to the beginning of the path for the neighbouring box
                var neighbourPathWithThisBoxAdded = _.flatten([box, onePathFromNeighbour]);
                return neighbourPathWithThisBoxAdded;
            });
        });
        // Combine the results from all directions into one list
        return _.flatten(routesForEachDirection, true);
    } else {
        // There are no neighbours to visit.  Return one path which visits this box.
        return [ [ box ] ];
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

function processMap (mountainMap) {
    /* We will take a dynamic programming approach:
     * We will visit each of the boxes from the bottom of the mountain upwards.
     * For each box we will determine its maxDistance based on its neighbouring boxes.
     * Any neighbours lower down the mountain will already have been processed.
     * This approach means we can find the maxDistance for all boxes in linear time.
     */

    var dataMap = createDataMap(mountainMap);

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
    console.log("[find_longest_route.js] potentialPaths:", potentialPaths.map(simplifyPath).join(", "));

    var steepestPaths = selectPathsWithGreatestSteepness(potentialPaths);

    // For the purposes of the exercise, assume there will be only one solution:
    steepestPaths.forEach(function (steepestPath) {
        console.log("[find_longest_route.js] Steepest path %s has length %s and drop %s", simplifyPath(steepestPath), steepestPath.length, steepestPath.steepness);
    });
}

var filename = process.argv[2];

readMap(filename, processMap);
