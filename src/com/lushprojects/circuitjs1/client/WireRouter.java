package com.lushprojects.circuitjs1.client;

import java.util.*;
import com.google.gwt.canvas.dom.client.Context2d;

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

    public static WireRouter lastRouter;

    public WireRouter() {
	lastRouter = this;
    }

    public void setTurnPenalty(double penalty) {
        this.turnPenalty = penalty;
    }

    /**
     * Mark a line segment as obstacle (pixel coordinates, snapped to grid internally)
     */
    public void addObstacle(int px1, int py1, int px2, int py2) {
	px1 += gridSize/2;
	px2 += gridSize/2;
	py1 += gridSize/2;
	py2 += gridSize/2;
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

    public void addObstacle(Point pts[]) {
	int minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
	for (int i = 1; i < pts.length; i++) {
	    if (pts[i].x < minX) minX = pts[i].x;
	    if (pts[i].y < minY) minY = pts[i].y;
	    if (pts[i].x > maxX) maxX = pts[i].x;
	    if (pts[i].y > maxY) maxY = pts[i].y;
	}
	addObstacle(minX, minY, maxX, maxY);
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

	int margin = 2;

	// snap origin to grid
	originX = (minX / gridSize) * gridSize - margin*gridSize;
	originY = (minY / gridSize) * gridSize - margin*gridSize;

	// compute rows/cols from origin-relative extents
	rows = (maxY - originY) / gridSize + 1 + margin*2;
	cols = (maxX - originX) / gridSize + 1 + margin*2;
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
	    ArrayList<Point> result = new ArrayList<Point>();
	    result.add(new Point(startC * gridSize + originX, startR * gridSize + originY));
	    return result;
	}

	int[] startPrefs = getPreferredEscapeDirections(startR, startC);
	double bestCost = Double.POSITIVE_INFINITY;
	List<int[]> bestCorners = null;

	// ─────────────────────────────────────────────
	// 1. L-shapes (1 bend)
	// ─────────────────────────────────────────────

	if (startR != goalR && startC != goalC) {
	    // A: horizontal then vertical
	    List<int[]> path1 = new ArrayList<int[]>();
	    path1.add(new int[]{startR, startC});
	    path1.add(new int[]{startR, goalC});
	    path1.add(new int[]{goalR, goalC});
	    int dir1 = (goalC > startC) ? RIGHT : LEFT;
	    double cost1 = evaluatePath(path1, dir1, startPrefs);
	    if (cost1 >= 0 && cost1 < bestCost) {
		bestCost = cost1;
		bestCorners = path1;
	    }

	    // B: vertical then horizontal
	    List<int[]> path2 = new ArrayList<int[]>();
	    path2.add(new int[]{startR, startC});
	    path2.add(new int[]{goalR, startC});
	    path2.add(new int[]{goalR, goalC});
	    int dir2 = (goalR > startR) ? DOWN : UP;
	    double cost2 = evaluatePath(path2, dir2, startPrefs);
	    if (cost2 >= 0 && cost2 < bestCost) {
		bestCost = cost2;
		bestCorners = path2;
	    }
	} else if (startR == goalR) {
	    // straight horizontal
	    List<int[]> path = new ArrayList<int[]>();
	    path.add(new int[]{startR, startC});
	    path.add(new int[]{goalR, goalC});
	    int dir = (goalC > startC) ? RIGHT : LEFT;
	    double cost = evaluatePath(path, dir, startPrefs);
	    if (cost >= 0 && cost < bestCost) {
		bestCost = cost;
		bestCorners = path;
	    }
	} else {
	    // straight vertical
	    List<int[]> path = new ArrayList<int[]>();
	    path.add(new int[]{startR, startC});
	    path.add(new int[]{goalR, goalC});
	    int dir = (goalR > startR) ? DOWN : UP;
	    double cost = evaluatePath(path, dir, startPrefs);
	    if (cost >= 0 && cost < bestCost) {
		bestCost = cost;
		bestCorners = path;
	    }
	}

	// ─────────────────────────────────────────────
	// 2. Z-shapes (2 bends) — try detour on both sides
	// ─────────────────────────────────────────────

	int detourMargin = 3;

	// Variant 1: vertical – horizontal – vertical (detour column)
	if (startR != goalR) {
	    int midR = (startR + goalR) / 2;
	    for (int side : new int[]{-1, +1}) {
		int detourCol = startC + side * detourMargin;
		if (!isValid(0, detourCol)) continue;

		List<int[]> z = new ArrayList<int[]>();
		z.add(new int[]{startR, startC});
		if (startC != detourCol)
		    z.add(new int[]{startR, detourCol});
		if (startR != goalR)
		    z.add(new int[]{goalR, detourCol});
		if (detourCol != goalC)
		    z.add(new int[]{goalR, goalC});
		if (z.size() >= 2) {
		    int dir = (detourCol > startC) ? RIGHT : LEFT;
		    double cost = evaluatePath(z, dir, startPrefs);
		    if (cost >= 0 && cost < bestCost) {
			bestCost = cost;
			bestCorners = z;
		    }
		}

		// also try going to midpoint row first
		detourCol = goalC + side * detourMargin;
		if (!isValid(0, detourCol)) continue;
		z = new ArrayList<int[]>();
		z.add(new int[]{startR, startC});
		if (startC != detourCol)
		    z.add(new int[]{startR, detourCol});
		if (startR != goalR)
		    z.add(new int[]{goalR, detourCol});
		if (detourCol != goalC)
		    z.add(new int[]{goalR, goalC});
		if (z.size() >= 2) {
		    int dir = (detourCol > startC) ? RIGHT : LEFT;
		    double cost = evaluatePath(z, dir, startPrefs);
		    if (cost >= 0 && cost < bestCost) {
			bestCost = cost;
			bestCorners = z;
		    }
		}
	    }
	}

	// Variant 2: horizontal – vertical – horizontal (detour row)
	if (startC != goalC) {
	    for (int side : new int[]{-1, +1}) {
		int detourRow = startR + side * detourMargin;
		if (!isValid(detourRow, 0)) continue;

		List<int[]> z = new ArrayList<int[]>();
		z.add(new int[]{startR, startC});
		if (startR != detourRow)
		    z.add(new int[]{detourRow, startC});
		if (startC != goalC)
		    z.add(new int[]{detourRow, goalC});
		if (detourRow != goalR)
		    z.add(new int[]{goalR, goalC});
		if (z.size() >= 2) {
		    int dir = (detourRow > startR) ? DOWN : UP;
		    double cost = evaluatePath(z, dir, startPrefs);
		    if (cost >= 0 && cost < bestCost) {
			bestCost = cost;
			bestCorners = z;
		    }
		}

		detourRow = goalR + side * detourMargin;
		if (!isValid(detourRow, 0)) continue;
		z = new ArrayList<int[]>();
		z.add(new int[]{startR, startC});
		if (startR != detourRow)
		    z.add(new int[]{detourRow, startC});
		if (startC != goalC)
		    z.add(new int[]{detourRow, goalC});
		if (detourRow != goalR)
		    z.add(new int[]{goalR, goalC});
		if (z.size() >= 2) {
		    int dir = (detourRow > startR) ? DOWN : UP;
		    double cost = evaluatePath(z, dir, startPrefs);
		    if (cost >= 0 && cost < bestCost) {
			bestCost = cost;
			bestCorners = z;
		    }
		}
	    }
	}

	if (bestCorners == null) {
	    return new ArrayList<Point>();
	}

	return pixelsFromGridPoints(bestCorners);
    }

    // Evaluate a candidate path. Returns cost if valid, -1 if invalid.
    private double evaluatePath(List<int[]> corners, int initialDir, int[] startPrefs) {
	if (corners.size() < 2) return -1;

	double cost = 0.0;
	int prevDir = NONE;
	int[] prev = corners.get(0);

	for (int i = 1; i < corners.size(); i++) {
	    int[] curr = corners.get(i);
	    int dr = curr[0] - prev[0];
	    int dc = curr[1] - prev[1];
	    int steps = Math.max(Math.abs(dr), Math.abs(dc));
	    if (steps == 0) continue; // skip zero-length segments
	    int moveDir;

	    if (dr == 0 && dc > 0)      moveDir = RIGHT;
	    else if (dr == 0 && dc < 0) moveDir = LEFT;
	    else if (dc == 0 && dr > 0) moveDir = DOWN;
	    else if (dc == 0 && dr < 0) moveDir = UP;
	    else return -1; // diagonal

	    // Check every cell along the segment
	    int r = prev[0], c = prev[1];
	    for (int s = 0; s < steps; s++) {
		r += Integer.signum(dr);
		c += Integer.signum(dc);
		if (!isValid(r, c) || !canMoveTo(r, c, moveDir))
		    return -1;
	    }

	    cost += steps;
	    if (prevDir != NONE && moveDir != prevDir && moveDir != opposite(prevDir))
		cost += turnPenalty;
	    prevDir = moveDir;
	    prev = curr;
	}

	// Escape bonus
	for (int p : startPrefs) {
	    if (p == initialDir) {
		cost += ESCAPE_BONUS;
		break;
	    }
	}

	return cost;
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

	// check if endpoint is unreachable (blocked from all directions)
	if (!canMoveTo(goalR, goalC, UP) && !canMoveTo(goalR, goalC, DOWN) &&
	    !canMoveTo(goalR, goalC, LEFT) && !canMoveTo(goalR, goalC, RIGHT)) {
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

    /**
     * Draws the routing grid visualization onto the canvas context.
     * - Obstacles → red squares
     * - Horizontal wire segments → light blue horizontal lines
     * - Vertical wire segments → light blue vertical lines
     * - Junctions (both directions) → small cyan cross or dot
     * Grid lines are faint gray for reference.
     *
     * @param ctx       the Canvas 2D context to draw on
     * @param showGridLines whether to draw faint background grid (useful for debugging)
     */
    public void drawGrid(Context2d ctx, boolean showGridLines) {
	if (grid == null || rows == 0 || cols == 0) {
	    return;
	}

	ctx.save();
	ctx.translate(-gridSize/2, -gridSize/2);

	// Optional: faint full grid lines (helps see alignment)
	if (showGridLines) {
	    ctx.setStrokeStyle("#222244");  // very dark blue-gray
	    ctx.setLineWidth(0.5);
	    for (int r = 0; r < rows; r++) {
		int y = originY + r * gridSize;
		ctx.beginPath();
		ctx.moveTo(originX, y);
		ctx.lineTo(originX + cols * gridSize, y);
		ctx.stroke();
	    }
	    for (int c = 0; c < cols; c++) {
		int x = originX + c * gridSize;
		ctx.beginPath();
		ctx.moveTo(x, originY);
		ctx.lineTo(x, originY + rows * gridSize);
		ctx.stroke();
	    }
	}

	// Main content: obstacles & wires
	for (int r = 0; r < rows; r++) {
	    for (int c = 0; c < cols; c++) {
		int cell = grid[r][c];
		int x = originX + c * gridSize;
		int y = originY + r * gridSize;
		int size = gridSize;

		// 1. Obstacles (usually drawn first / underneath)
		if ((cell & OBSTACLE) != 0) {
		    ctx.setFillStyle("#88ccff");   // light cyan-blue
		    //ctx.setFillStyle("rgba(180, 40, 40, 0.65)");  // semi-transparent red
		    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
		    continue;
		}

		// 2. Wires
		boolean hasHoriz = (cell & HORIZONTAL) != 0;
		boolean hasVert  = (cell & VERTICAL)  != 0;

		if (hasHoriz || hasVert) {
		    ctx.setStrokeStyle("#88ccff");   // light cyan-blue
		    ctx.setLineWidth(2.2);

		    double midX = x + size / 2.0;
		    double midY = y + size / 2.0;

		    if (hasHoriz) {
			ctx.beginPath();
			ctx.moveTo(x + 2, midY);
			ctx.lineTo(x + size - 2, midY);
			ctx.stroke();
		    }

		    if (hasVert) {
			ctx.beginPath();
			ctx.moveTo(midX, y + 2);
			ctx.lineTo(midX, y + size - 2);
			ctx.stroke();
		    }

		    // Junction / cross (both directions)
		    if (hasHoriz && hasVert) {
			ctx.setFillStyle("#44aaff");
			ctx.beginPath();
			ctx.arc(midX, midY, 3.5, 0, 2 * Math.PI);
			ctx.fill();
		    }
		}
	    }
	}

	// Optional: highlight origin for debugging
	ctx.setFillStyle("rgba(255, 180, 60, 0.4)");
	ctx.fillRect(originX - 4, originY - 4, 8, 8);

	ctx.restore();
    }
}
