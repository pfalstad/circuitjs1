package com.lushprojects.circuitjs1.client;

import java.util.*;

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

    public WireRouter(int rows, int cols) {
        this.rows = rows;
        this.cols = cols;
        this.grid = new int[rows][cols];
    }

    public void setTurnPenalty(double penalty) {
        this.turnPenalty = penalty;
    }

    /**
     * Mark a rectangular area as obstacle
     */
    public void addObstacle(int r1, int c1, int r2, int c2) {
        int minR = Math.min(r1, r2);
        int maxR = Math.max(r1, r2);
        int minC = Math.min(c1, c2);
        int maxC = Math.max(c1, c2);
		CirSim.console("add obstacle " + c1 + " " + r1 + " " + c2 + " " + r2);
        for (int r = minR; r <= maxR; r++) {
            for (int c = minC; c <= maxC; c++) {
                if (isValid(r, c)) {
                    grid[r][c] = OBSTACLE;
                }
            }
        }
    }

    public void initGrid(int rows, int cols, CircuitElm wire) {
        this.rows = rows;
        this.cols = cols;
        this.grid = new int[rows][cols];
	int gridSize = CirSim.theApp.gridSize;
	for (CircuitElm ce: UIManager.theUI.elmList) {
	    if (wire == ce)
		continue;
	    addObstacle(ce.y/gridSize, ce.x/gridSize, ce.y2/gridSize, ce.x2/gridSize);
	}
	grid[wire.y /gridSize][wire.x /gridSize] = 0;
	grid[wire.y2/gridSize][wire.x2/gridSize] = 0;
    }

    /**
     * Try to route a wire from (x1,y1) to (x2,y2)
     * Returns list of points [ {r,c}, ... ] or empty list if no path
     */
    public List<int[]> routeWire(int x1, int y1, int x2, int y2) {
        // In this version: x = column, y = row  (as in canvas)
	CirSim.console("routeWire " + x1 + " " + y1 + " " + x2 + " " + y2);
        int startR = y1;
        int startC = x1;
        int goalR = y2;
        int goalC = x2;

        if (!isValid(startR, startC) || !isValid(goalR, goalC)) {
            return Collections.emptyList();
        }

        Map<String, String> cameFrom = new HashMap<>();
        Map<String, Double> gScore = new HashMap<>();
        Map<String, Double> fScore = new HashMap<>();
        Set<String> openSet = new HashSet<>();

        // Enqueue start with all four possible first directions
        for (int d : new int[]{UP, DOWN, LEFT, RIGHT}) {
            String key = key(startR, startC, d);
            openSet.add(key);
            gScore.put(key, 0.0);
            fScore.put(key, (double) manhattan(startR, startC, goalR, goalC));
        }

        String bestGoalKey = null;
        double bestGoalCost = Double.POSITIVE_INFINITY;

        while (!openSet.isEmpty()) {
            // Find lowest f-score
            String currentKey = null;
            double lowestF = Double.POSITIVE_INFINITY;
            for (String k : openSet) {
                double f = fScore.getOrDefault(k, Double.POSITIVE_INFINITY);
                if (f < lowestF) {
                    lowestF = f;
                    currentKey = k;
                }
            }
            if (currentKey == null) break;

            int[] curr = parseKey(currentKey);
            int cr = curr[0], cc = curr[1], cDir = curr[2];

            if (cr == goalR && cc == goalC) {
                if (gScore.get(currentKey) < bestGoalCost) {
                    bestGoalCost = gScore.get(currentKey);
                    bestGoalKey = currentKey;
                }
                // We continue searching — there might be better (lower cost) paths
            }

            openSet.remove(currentKey);

            for (int[] neigh : neighbors(cr, cc)) {
                int nr = neigh[0], nc = neigh[1], moveDir = neigh[2];

                if (!canMoveTo(nr, nc, moveDir)) continue;

                double moveCost = 1.0;
                if (cDir != NONE) {
                    if (moveDir != cDir && moveDir != opposite(cDir)) {
                        moveCost += turnPenalty;
                    }
                }

                String nKey = key(nr, nc, moveDir);
                double tentG = gScore.getOrDefault(currentKey, Double.POSITIVE_INFINITY) + moveCost;

                if (tentG < gScore.getOrDefault(nKey, Double.POSITIVE_INFINITY)) {
                    cameFrom.put(nKey, currentKey);
                    gScore.put(nKey, tentG);
                    fScore.put(nKey, tentG + manhattan(nr, nc, goalR, goalC));
                    openSet.add(nKey);
                }
            }
        }

        if (bestGoalKey == null) {
            return Collections.emptyList();
        }

        // Reconstruct path
        List<int[]> path = new ArrayList<>();
        String current = bestGoalKey;
        while (current != null) {
            int[] pos = parseKey(current);
            path.add(0, new int[]{pos[0], pos[1]});  // [row, col]
            current = cameFrom.get(current);
        }

        return path;
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
