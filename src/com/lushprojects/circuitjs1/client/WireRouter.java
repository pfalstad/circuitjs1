package com.lushprojects.circuitjs1.client;

import java.util.*;
import java.util.function.BiConsumer;

public class WireRouter {

    private int rows;
    private int cols;
    private int[][] grid;  // 0=empty, 1=obstacle, bitflags for wires: 2=horizontal, 4=vertical

    private static final int OBSTACLE   = 1;
    private static final int HORIZONTAL = 2;
    private static final int VERTICAL   = 4;

    // Directions
    private static final int NONE  = 0;
    private static final int UP    = 1;
    private static final int DOWN  = 2;
    private static final int LEFT  = 3;
    private static final int RIGHT = 4;

    private double turnPenalty = 4.0;
    private int gridSize;
    private int originX, originY;  // pixel origin snapped to grid

    public WireRouter() {
    }

    public void setTurnPenalty(double penalty) {
        this.turnPenalty = penalty;
    }

    /**
     * Mark a line segment as obstacle (pixel coordinates, snapped to grid internally)
     */
    public void addObstacle(int px1, int py1, int px2, int py2) {
	int r1 = (py1 - originY) / gridSize;
	int c1 = (px1 - originX) / gridSize;
	int r2 = (py2 - originY) / gridSize;
	int c2 = (px2 - originX) / gridSize;
        int minR = Math.min(r1, r2);
        int maxR = Math.max(r1, r2);
        int minC = Math.min(c1, c2);
        int maxC = Math.max(c1, c2);
	for (int c = minC; c <= maxC; c++)
	    for (int r = minR; r <= maxR; r++)
		if (isValid(r, c))
			grid[r][c] |= OBSTACLE;
    }

    public void addWire(int px1, int py1, int px2, int py2) {
	int r1 = (py1 - originY) / gridSize;
	int c1 = (px1 - originX) / gridSize;
	int r2 = (py2 - originY) / gridSize;
	int c2 = (px2 - originX) / gridSize;
        int minR = Math.min(r1, r2);
        int maxR = Math.max(r1, r2);
        int minC = Math.min(c1, c2);
        int maxC = Math.max(c1, c2);
	if (r1 == r2) {
	    for (int c = minC; c <= maxC; c++)
		if (isValid(r1, c))
		    grid[r1][c] |= HORIZONTAL;
	} else {
	    for (int r = minR; r <= maxR; r++)
		if (isValid(r, c1))
		    grid[r][c1] |= VERTICAL;
	}
    }

    public void initGrid(CircuitElm wire) {
	gridSize = CirSim.theApp.gridSize;
	Rectangle bounds = UIManager.theUI.getCircuitBounds();

	// enlarge bounds to include wire endpoints
	int minX = Math.min(wire.x, wire.x2);
	int minY = Math.min(wire.y, wire.y2);
	int maxX = Math.max(wire.x, wire.x2);
	int maxY = Math.max(wire.y, wire.y2);
	if (bounds != null) {
	    minX = Math.min(minX, bounds.x);
	    minY = Math.min(minY, bounds.y);
	    maxX = Math.max(maxX, bounds.x + bounds.width);
	    maxY = Math.max(maxY, bounds.y + bounds.height);
	}

	// snap origin to grid
	originX = (minX / gridSize) * gridSize;
	originY = (minY / gridSize) * gridSize;

	// compute rows/cols from origin-relative extents
	rows = (maxY - originY) / gridSize + 2;
	cols = (maxX - originX) / gridSize + 2;
	grid = new int[rows][cols];

	for (CircuitElm ce : UIManager.theUI.elmList) {
	    if (wire == ce)
		continue;
	    ce.addRoutingObstacle(this);
	}
	// clear start and end cells so routing can reach them
	grid[(wire.y  - originY) / gridSize][(wire.x  - originX) / gridSize] = 0;
	grid[(wire.y2 - originY) / gridSize][(wire.x2 - originX) / gridSize] = 0;
    }

    private static final double ESCAPE_BONUS = -0.4;   // negative = reward. Tune: -0.2 to -0.8

    private int dr(int dir) {
	switch (dir) {
	    case UP:    return -1;  // up decreases row
	    case DOWN:  return +1;  // down increases row
	    case LEFT:  return  0;
	    case RIGHT: return  0;
	    default:    return  0;  // safety
	}
    }

    private int dc(int dir) {
	switch (dir) {
	    case UP:    return  0;
	    case DOWN:  return  0;
	    case LEFT:  return -1;  // left decreases column
	    case RIGHT: return +1;  // right increases column
	    default:    return  0;
	}
    }

    // Returns array of preferred initial directions from (r,c)
    // 0 = none blocked → all allowed,  >0 = prefer these to escape
    private int[] getPreferredEscapeDirections(int r, int c) {
	List<Integer> prefs = new ArrayList<>();
	// Check four immediate neighbors
	if (!canMoveTo(r - 1, c, UP))    prefs.add(DOWN);    // blocked above → prefer down
	if (!canMoveTo(r + 1, c, DOWN))  prefs.add(UP);
	if (!canMoveTo(r, c - 1, LEFT))  prefs.add(RIGHT);
	if (!canMoveTo(r, c + 1, RIGHT)) prefs.add(LEFT);

	if (prefs.isEmpty()) {
	    // Nothing blocked → no strong preference (or you could bias toward goal direction)
	    return new int[0];
	}
	int[] arr = new int[prefs.size()];
	for (int i = 0; i < prefs.size(); i++) arr[i] = prefs.get(i);
	return arr;
    }

    /**
     * Tries fast pattern routes (L and Z shapes).
     * Returns compressed pixel path if successful, else empty list.
     */
    private ArrayList<Point> tryPatternRouting(int startR, int startC, int goalR, int goalC) {
	if (startR == goalR && startC == goalC) {
	    // trivial case
	    return pixelsFromGridPoints(List.of(new int[]{startR, startC}));
	}

	int[] startPrefs = getPreferredEscapeDirections(startR, startC);

	// We'll collect valid patterns with their scores
	// Each entry: [cost, List<int[]> gridCorners]
	List<Object[]> candidates = new ArrayList<>();

	// Helper to check a full path and compute its cost
	BiConsumer<List<int[]>, Integer> tryPath = (corners, initialDir) -> {
	    if (corners.size() < 2) return;

	    boolean valid = true;
	    double cost = 0.0;
	    int prevDir = NONE;
	    int[] prev = corners.get(0);

	    for (int i = 1; i < corners.size(); i++) {
		int[] curr = corners.get(i);
		int dr = curr[0] - prev[0];
		int dc = curr[1] - prev[1];
		int steps = Math.max(Math.abs(dr), Math.abs(dc));
		int moveDir;

		if (dr == 0 && dc > 0)      moveDir = RIGHT;
		else if (dr == 0 && dc < 0) moveDir = LEFT;
		else if (dc == 0 && dr > 0) moveDir = DOWN;
		else if (dc == 0 && dr < 0) moveDir = UP;
		else { valid = false; break; } // diagonal or invalid

		// Check every cell along the segment
		int r = prev[0], c = prev[1];
		for (int s = 0; s < steps; s++) {
		    r += Integer.signum(dr);
		    c += Integer.signum(dc);
		    if (!isValid(r, c) || !canMoveTo(r, c, moveDir)) {
			valid = false;
			break;
		    }
		}
		if (!valid) break;

		// Cost: steps + turn penalty
		cost += steps;
		if (prevDir != NONE && moveDir != prevDir && moveDir != opposite(prevDir)) {
		    cost += turnPenalty;
		}
		prevDir = moveDir;
		prev = curr;
	    }

	    if (valid) {
		// Add escape bonus if first move matches preference
		int firstDir = initialDir;
		boolean preferred = false;
		for (int p : startPrefs) {
		    if (p == firstDir) {
			preferred = true;
			break;
		    }
		}
		if (preferred) {
		    cost += ESCAPE_BONUS; // negative
		}

		candidates.add(new Object[]{cost, corners});
	    }
	};

	// ─────────────────────────────────────────────
	// 1. L-shapes (0 or 1 bend)
	// ─────────────────────────────────────────────

	// Longer segment first — two classic orders
	// A → horizontal then vertical
	List<int[]> path1 = List.of(
	    new int[]{startR, startC},
	    new int[]{startR, goalC},
	    new int[]{goalR, goalC}
	);
	int dir1 = (goalC > startC) ? RIGHT : LEFT;
	tryPath.accept(path1, dir1);

	// B → vertical then horizontal
	List<int[]> path2 = List.of(
	    new int[]{startR, startC},
	    new int[]{goalR, startC},
	    new int[]{goalR, goalC}
	);
	int dir2 = (goalR > startR) ? DOWN : UP;
	tryPath.accept(path2, dir2);

	// ─────────────────────────────────────────────
	// 2. Z-shapes (2 bends) — try detour on both sides
	// ─────────────────────────────────────────────

	// Variant 1: horizontal – vertical – horizontal
	// We try two detour rows: one "above" start side, one "below"
	int detourMargin = 3; // or 2–3 if you want more space to try

	for (int side : new int[]{-1, +1}) {
	    int detourRow = startR + side * detourMargin;
	    if (!isValid(detourRow, 0)) continue;

	    List<int[]> z1 = List.of(
		new int[]{startR, startC},
		new int[]{detourRow, startC},      // vertical first
		new int[]{detourRow, goalC},       // long horizontal
		new int[]{goalR, goalC}
	    );
	    tryPath.accept(z1, (detourRow < startR) ? UP : DOWN);

	    List<int[]> z2 = List.of(
		new int[]{startR, startC},
		new int[]{startR, goalC},          // long horizontal first
		new int[]{detourRow, goalC},
		new int[]{goalR, goalC}
	    );
	    tryPath.accept(z2, (goalC > startC) ? RIGHT : LEFT);
	}

	// Variant 2: vertical – horizontal – vertical (symmetric)
	for (int side : new int[]{-1, +1}) {
	    int detourCol = startC + side * detourMargin;
	    if (!isValid(0, detourCol)) continue;

	    List<int[]> z3 = List.of(
		new int[]{startR, startC},
		new int[]{startR, detourCol},
		new int[]{goalR, detourCol},
		new int[]{goalR, goalC}
	    );
	    tryPath.accept(z3, (detourCol < startC) ? LEFT : RIGHT);

	    List<int[]> z4 = List.of(
		new int[]{startR, startC},
		new int[]{goalR, startC},
		new int[]{goalR, detourCol},
		new int[]{goalR, goalC}
	    );
	    tryPath.accept(z4, (goalR > startR) ? DOWN : UP);
	}

	if (candidates.isEmpty()) {
	    return new ArrayList<>();
	}

	// Pick best (lowest cost)
	candidates.sort(Comparator.comparingDouble(a -> (Double) a[0]));
	List<int[]> bestCorners = (List<int[]>) candidates.get(0)[1];

	// Convert to pixel points
	return pixelsFromGridPoints(bestCorners);
    }

    private ArrayList<Point> pixelsFromGridPoints(List<int[]> gridPoints) {
	ArrayList<Point> result = new ArrayList<>();
	for (int[] g : gridPoints) {
	    int px = g[1] * gridSize + originX;
	    int py = g[0] * gridSize + originY;
	    result.add(new Point(px, py));
	}
	return result;
    }

    /**
     * Try to route a wire from (px1,py1) to (px2,py2) in pixel coordinates.
     * Returns list of Points in pixel coordinates (corners only),
     * or empty list if no path.
     */
    public ArrayList<Point> routeWire(int px1, int py1, int px2, int py2) {
	int startR = (py1 - originY) / gridSize;
	int startC = (px1 - originX) / gridSize;
	int goalR  = (py2 - originY) / gridSize;
	int goalC  = (px2 - originX) / gridSize;

	if (!isValid(startR, startC) || !isValid(goalR, goalC)) {
	    return new ArrayList<Point>();
	}

	// try simple algorithm first
	ArrayList<Point> patternPath = tryPatternRouting(startR, startC, goalR, goalC);
	if (!patternPath.isEmpty()) {
	    CirSim.console("pattern");
	    return patternPath;
	}

	CirSim.console("A*");
	// now try A*

	// Priority queue: smallest f-score first
	PriorityQueue<Node> openSet = new PriorityQueue<>(
	    Comparator.comparingDouble(n -> n.fScore)
	);

	// Best known g-score for each (r,c,dir) state
	Map<String, Double> gScore = new HashMap<>();

	// cameFrom: predecessor for path reconstruction
	Map<String, String> cameFrom = new HashMap<>();

	// We'll track visited states loosely via gScore

	// Enqueue start with all four possible first directions

	int[] startPrefs = getPreferredEscapeDirections(startR, startC);
	// Optional: int[] goalPrefs  = getPreferredEscapeDirections(goalR, goalC); // if you want goal bias too

	for (int d : new int[]{UP, DOWN, LEFT, RIGHT}) {
	    if (!canMoveTo(startR + dr(d), startC + dc(d), d)) continue;

	    String key = key(startR, startC, d);
	    
	    double initG = 0.0;
	    
	    // Reward if this is a preferred escape direction
	    boolean isPreferred = false;
	    for (int pref : startPrefs) {
		if (pref == d) {
		    isPreferred = true;
		    break;
		}
	    }
	    if (isPreferred) {
		initG += ESCAPE_BONUS;   // negative → looks cheaper
	    }

	    double h = manhattan(startR, startC, goalR, goalC);
	    Node startNode = new Node(startR, startC, d, initG, initG + h);
	    
	    openSet.offer(startNode);
	    gScore.put(key, initG);
	}


	Node bestGoalNode = null;

	while (!openSet.isEmpty()) {
	    Node current = openSet.poll();

	    String currKey = key(current.r, current.c, current.dir);

	    // Skip if we already found a better way to this exact state
	    if (current.gScore > gScore.getOrDefault(currKey, Double.POSITIVE_INFINITY)) {
		continue;
	    }

	    if (current.r == goalR && current.c == goalC) {
		// We can return immediately if we want any path,
		// but to get the lowest-cost path we continue until queue is empty
		if (bestGoalNode == null || current.gScore < bestGoalNode.gScore) {
		    bestGoalNode = current;
		}
		// Optional: early exit if you accept first-found goal
		// if (turnPenalty == 0) return reconstruct(...); // when no turns, first is optimal
	    }

	    for (int[] neigh : neighbors(current.r, current.c)) {
		int nr = neigh[0], nc = neigh[1], moveDir = neigh[2];

		if (!canMoveTo(nr, nc, moveDir)) continue;

		double moveCost = 1.0;
		if (current.dir != NONE) {
		    if (moveDir != current.dir && moveDir != opposite(current.dir)) {
			moveCost += turnPenalty;
		    }
		}

		String nKey = key(nr, nc, moveDir);
		double tentG = current.gScore + moveCost;

		double bestKnownG = gScore.getOrDefault(nKey, Double.POSITIVE_INFINITY);
		if (tentG < bestKnownG) {
		    cameFrom.put(nKey, currKey);
		    gScore.put(nKey, tentG);
		    double h = manhattan(nr, nc, goalR, goalC);
		    double f = tentG + h;

		    // Push new (better) entry into queue
		    // (old worse entries will be ignored when dequeued)
		    openSet.offer(new Node(nr, nc, moveDir, tentG, f));
		}
	    }
	}

	if (bestGoalNode == null) {
	    return new ArrayList<Point>();
	}

	// Reconstruct full path in grid coords
	List<int[]> fullPath = new ArrayList<>();
	String currentKey = key(bestGoalNode.r, bestGoalNode.c, bestGoalNode.dir);
	while (currentKey != null) {
	    int[] pos = parseKey(currentKey);
	    fullPath.add(0, new int[]{pos[0], pos[1]});
	    currentKey = cameFrom.get(currentKey);
	}

	// Compress to minimal corners, then convert to pixel Points
	List<int[]> compressed = compressPath(fullPath);
	ArrayList<Point> result = new ArrayList<Point>();
	for (int[] pt : compressed)
	    result.add(new Point(pt[1] * gridSize + originX, pt[0] * gridSize + originY));
	return result;
    }

    /**
     * Small helper class for priority queue entries
     */
    private static class Node {
	final int r, c, dir;
	final double gScore;
	final double fScore;

	Node(int r, int c, int dir, double g, double f) {
	    this.r = r;
	    this.c = c;
	    this.dir = dir;
	    this.gScore = g;
	    this.fScore = f;
	}
    }

    /**
     * Extract only the bend points + start + end
     */
    private List<int[]> compressPath(List<int[]> fullPath) {
	if (fullPath.size() <= 2) return new ArrayList<>(fullPath);

	List<int[]> minimal = new ArrayList<>();
	minimal.add(fullPath.get(0));

	for (int i = 1; i < fullPath.size() - 1; i++) {
	    int[] a = fullPath.get(i - 1);
	    int[] b = fullPath.get(i);
	    int[] c = fullPath.get(i + 1);

	    int dx1 = b[1] - a[1];
	    int dy1 = b[0] - a[0];
	    int dx2 = c[1] - b[1];
	    int dy2 = c[0] - b[0];

	    // Not collinear if cross product != 0 or opposite direction
	    boolean collinear = (dx1 * dy2 - dy1 * dx2 == 0) &&
				(dx1 * dx2 + dy1 * dy2 > 0);

	    if (!collinear) {
		minimal.add(b);
	    }
	}

	int[] last = fullPath.get(fullPath.size() - 1);
	int[] prev = minimal.get(minimal.size() - 1);
	if (prev[0] != last[0] || prev[1] != last[1]) {
	    minimal.add(last);
	}

	return minimal;
    }


    /**
     * Place the wire on the grid after finding a path
     * (call this after routeWire if you want to commit the path)
     */
    public void placeWire(List<int[]> path) {
        if (path.size() < 2) return;

        // Start and end as junctions
        int[] s = path.get(0);
        int[] e = path.get(path.size() - 1);
        grid[s[0]][s[1]] |= (HORIZONTAL | VERTICAL);
        grid[e[0]][e[1]] |= (HORIZONTAL | VERTICAL);

        int prevDir = NONE;

        for (int i = 1; i < path.size(); i++) {
            int[] prev = path.get(i - 1);
            int[] curr = path.get(i);
            int dr = curr[0] - prev[0];
            int dc = curr[1] - prev[1];
            int thisDir = getMoveDir(dr, dc);
            int flag = (thisDir == LEFT || thisDir == RIGHT) ? HORIZONTAL : VERTICAL;

            grid[curr[0]][curr[1]] |= flag;

            // Bend: mark previous cell with both directions
            if (prevDir != NONE && thisDir != prevDir && thisDir != opposite(prevDir)) {
                grid[prev[0]][prev[1]] |= (HORIZONTAL | VERTICAL);
            }

            prevDir = thisDir;
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private boolean isValid(int r, int c) {
        return r >= 0 && r < rows && c >= 0 && c < cols;
    }

    private boolean canMoveTo(int r, int c, int moveDir) {
        if (!isValid(r, c)) return false;
        int cell = grid[r][c];
        if ((cell & OBSTACLE) != 0) return false;
        int flag = (moveDir == LEFT || moveDir == RIGHT) ? HORIZONTAL : VERTICAL;
        if ((cell & flag) != 0) return false;  // already has same direction
        return true;
    }

    private int getMoveDir(int dr, int dc) {
        if (dr == -1) return UP;
        if (dr ==  1) return DOWN;
        if (dc == -1) return LEFT;
        if (dc ==  1) return RIGHT;
        return NONE;
    }

    private int opposite(int d) {
        switch (d) {
            case UP:    return DOWN;
            case DOWN:  return UP;
            case LEFT:  return RIGHT;
            case RIGHT: return LEFT;
            default:    return NONE;
        }
    }

    private int manhattan(int r1, int c1, int r2, int c2) {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2);
    }

    private List<int[]> neighbors(int r, int c) {
        List<int[]> list = new ArrayList<>();
        if (r > 0)         list.add(new int[]{r-1, c, UP});
        if (r < rows-1)    list.add(new int[]{r+1, c, DOWN});
        if (c > 0)         list.add(new int[]{r, c-1, LEFT});
        if (c < cols-1)    list.add(new int[]{r, c+1, RIGHT});
        return list;
    }

    private String key(int r, int c, int d) {
        return r + "," + c + "," + d;
    }

    private int[] parseKey(String key) {
        String[] parts = key.split(",");
        return new int[]{
            Integer.parseInt(parts[0]),  // row
            Integer.parseInt(parts[1]),  // col
            Integer.parseInt(parts[2])   // dir
        };
    }

    // ─── Optional: for testing / debugging ─────────────────────────────────────

    public void printGrid() {
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                int v = grid[r][c];
                if (v == OBSTACLE) System.out.print("X ");
                else if (v == 0)    System.out.print(". ");
                else if ((v & HORIZONTAL) != 0 && (v & VERTICAL) != 0) System.out.print("+ ");
                else if ((v & HORIZONTAL) != 0) System.out.print("- ");
                else if ((v & VERTICAL)   != 0) System.out.print("| ");
                else System.out.print("? ");
            }
            System.out.println();
        }
    }
}
