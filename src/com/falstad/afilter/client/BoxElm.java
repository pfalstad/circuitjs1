package com.falstad.afilter.client;

import java.util.Vector;

class BoxElm extends CircuitElm {
    String text;
    final int FLAG_HIDDEN = 1;
    final int FLAG_ESCAPE = 2;
    public BoxElm(int xx, int yy) {
	super(xx, yy);
	text = "Box";
    }
    public BoxElm(int xa, int ya, int xb, int yb, int f,
		   StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	text = st.nextToken();
        if ((flags & FLAG_ESCAPE) == 0) {
            // old-style dump before escape/unescape
            while (st.hasMoreTokens())
                text += ' ' + st.nextToken();
        } else {
            // new-style dump
            text = CustomLogicModel.unescape(text); 
        }
    }
    String dump() {
        flags |= FLAG_ESCAPE;
        return super.dump() + " " + CustomLogicModel.escape(text);
    }
    int getDumpType() { return 'B'; }
    void draw(Graphics g) {
	g.setColor(isSelected() ? selectColor : lightGrayColor);
	if ((flags & FLAG_HIDDEN) == 0 || isSelected()) {
	    g.drawLine(x, y, x2, y);
	    g.drawLine(x2, y, x2, y2);
	    g.drawLine(x2, y2, x, y2);
	    g.drawLine(x, y2, x, y);
	}
	setBbox(x, y, x2, y2);
    }
    void getInfo(String arr[]) {
	arr[0] = text;
    }
    void setText(String x) { text = x; }
    int getPostCount() { return 0; }
    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Text", 0, -1, -1);
	    ei.text = text;
	    return ei;
	}
	if (n == 1) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox =
		new Checkbox("Hidden", (flags & FLAG_HIDDEN) != 0);
	    return ei;
	}
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    text = ei.textf.getText();
	}
	if (n == 1) {
	    if (ei.checkbox.getState())
		flags |= FLAG_HIDDEN;
	    else
		flags &= ~FLAG_HIDDEN;
	}
    }
}

