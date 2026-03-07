package com.lushprojects.circuitjs1.client;

import java.util.Vector;

import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.lushprojects.circuitjs1.client.util.Locale;

// instances of subcircuits

public class CustomCompositeElm extends CompositeElm {
    String modelName;
    CustomCompositeChipElm chip;
    int postCount;
    int inputCount, outputCount;
    CustomCompositeModel model;
    static String lastModelName = "default";
    static final int FLAG_SMALL = 2;
    
    public CustomCompositeElm(int xx, int yy) {
	super(xx, yy);
	
	// use last model as default when creating new element in UI.
	// use default otherwise, to avoid infinite recursion when creating nested subcircuits.
	modelName = (xx == 0 && yy == 0) ? "default" : lastModelName;
		
	flags |= FLAG_ESCAPE;
	if (useSmallGrid())
	    flags |= FLAG_SMALL;
	updateModels();
    }

    public CustomCompositeElm(int xx, int yy, String name) {
	super(xx, yy);
	modelName = name;
	flags |= FLAG_ESCAPE;
	if (useSmallGrid())
	    flags |= FLAG_SMALL;
	updateModels();
    }
    
    public CustomCompositeElm(int xa, int ya, int xb, int yb, int f,
            StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	modelName = CustomLogicModel.unescape(st.nextToken());
	updateModels(st);
    }
    
    void dumpXmlModel(Document doc) {
	// dump models of all children first
	for (int i = 0; i < compElmList.size(); i++)
	    compElmList.get(i).dumpXmlModel(doc);
	if (!(model.builtin || model.dumped))
	    model.dumpXml(doc);
    }

    void dumpXml(Document doc, Element elem) {
	dumpXmlModel(doc);
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "mo", modelName);
    }

    void undumpXml(XMLDeserializer xml) {
	modelName = xml.parseStringAttr("mo", modelName);
	updateModels();
	super.undumpXml(xml);
    }

    void draw(Graphics g) {
	int i;
	for (i = 0; i != postCount; i++) {
	    chip.volts[i] = volts[i];
	    chip.pins[i].current = getCurrentIntoNode(i); 
	}
	chip.setSelected(needsHighlight());
	chip.draw(g);
	boundingBox = chip.boundingBox;
    }

    void setPoints() {
	chip = new CustomCompositeChipElm(x, y);
	chip.x2 = x2;
	chip.y2 = y2;
	chip.flags = (flags & (ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y | ChipElm.FLAG_FLIP_XY));
        if (x2-x > model.sizeX*16 && isCreating())
	    flags &= ~FLAG_SMALL;
	chip.setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
	chip.setLabel((model.flags & CustomCompositeModel.FLAG_SHOW_LABEL) != 0 ? model.name : null);
	
	chip.sizeX = model.sizeX;
	chip.sizeY = model.sizeY;
	chip.allocPins(postCount);
	int i;
	for (i = 0; i != postCount; i++) {
	    ExtListEntry pin = model.extList.get(i);
	    chip.setPin(i, pin.pos, pin.side, pin.name);
	}
	
	chip.setPoints();
	for (i = 0; i != getPostCount(); i++)
	    setPost(i, chip.getPost(i));
    }

    public void updateModels() {
	model = null;
	updateModels(null);
    }
    
    void flipX(int center2, int count) {
	flags ^= ChipElm.FLAG_FLIP_X;
	if (count != 1) {
	    int xs = (chip.flippedSizeX+1)*chip.cspc2;
	    x  = center2-x - xs;
	    x2 = center2-x2;
	}
	setPoints();
    }

    void flipY(int center2, int count) {
	flags ^= ChipElm.FLAG_FLIP_Y;
	if (count != 1) {
	    int xs = (chip.flippedSizeY-1)*chip.cspc2;
	    y  = center2-y - xs;
	    y2 = center2-y2;
	}
	setPoints();
    }

    boolean isFlippedX() { return (flags & ChipElm.FLAG_FLIP_X) != 0; }
    boolean isFlippedY() { return (flags & ChipElm.FLAG_FLIP_Y) != 0; }

    void flipXY(int xmy, int count) {
	flags ^= ChipElm.FLAG_FLIP_XY;

        // FLAG_FLIP_XY is applied first.  So need to swap X and Y
        if (isFlippedX() != isFlippedY())
            flags ^= ChipElm.FLAG_FLIP_X|ChipElm.FLAG_FLIP_Y;

	if (count != 1) {
	    x += chip.cspc2;
	    super.flipXY(xmy, count);
	    x -= chip.cspc2;
	}
	setPoints();
    }

    public void updateModels(StringTokenizer st) {
	if (model != null && model.name.equals(modelName))
	    return;
	model = CustomCompositeModel.getModelWithName(modelName);
	if (model == null)
	    return;
	postCount = model.extList.size();
	int externalNodes[] = new int[postCount];
	int i;
	for (i = 0; i != postCount; i++)
	    externalNodes[i] = model.extList.get(i).node;
	if (st != null) {
	    // old-format constructor: use loadComposite with per-instance state
	    loadComposite(st, model.getNodeList(), externalNodes);
	} else {
	    loadCompositeXml(model.getElmEntries(), externalNodes);
	}
	allocNodes();
	setPoints();
    }
    
    int getPostCount() { return postCount; }
    
    Vector<CustomCompositeModel> models;
    
    public EditInfo getEditInfo(int n) {
	// if model is built in, don't allow it to be changed
	if (model.builtin)
	    n += 2;
	
	if (n == 0) {
	    EditInfo ei = new EditInfo(EditInfo.makeLink("subcircuits.html", "Model Name"), 0, -1, -1);
            models = CustomCompositeModel.getModelList();
            ei.choice = new Choice();
            int i;
            for (i = 0; i != models.size(); i++) {
                CustomCompositeModel ccm = models.get(i);
                ei.choice.add(ccm.name);
                if (ccm == model)
                    ei.choice.select(i);
            }
	    return ei;
	}
        if (n == 1) {
            EditInfo ei = new EditInfo("", 0, -1, -1);
            ei.button = new Button(Locale.LS("Edit Pin Layout"));
            return ei;
        }
        if (n == 2 && canViewComponents()) {
            EditInfo ei = new EditInfo("", 0, -1, -1);
            ei.button = new Button(Locale.LS("View Components"));
            return ei;
        }
	int loadModelCircuit = (canViewComponents()) ? 3 : 2;
        if (n == loadModelCircuit && model.canLoadModelCircuit()) {
            EditInfo ei = new EditInfo("", 0, -1, -1);
            ei.button = new Button(Locale.LS("Edit Model"));
            return ei;
        }
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (model.builtin)
	    n += 2;
	if (n == 0) {
            model = models.get(ei.choice.getSelectedIndex());
	    lastModelName = modelName = model.name;
	    updateModels();
	    setPoints();
	    return;
	}
        if (n == 1) {
            if (model.name.equals("default")) {
        	Window.alert(Locale.LS("Can't edit this model."));
        	return;
            }
            EditCompositeModelDialog dlg = new EditCompositeModelDialog();
            dlg.setModel(model);
            dlg.createDialog();
            CirSim.dialogShowing = dlg;
            dlg.show();
            return;
        }
        if (n == 2) {
            app.ui.pushSubcircuit(this, buildDisplayElmList());
            CirSim.editDialog.closeDialog();
        }
	int loadModelCircuit = (canViewComponents()) ? 3 : 2;
        if (n == loadModelCircuit) {
            app.pushContext(model.name);
            if (model.modelCircuit != null)
        	app.readCircuit(model.modelCircuit);
            else {
        	XMLDeserializer xml = new XMLDeserializer(app);
        	xml.readCircuit(model.elmDoc);
            }
            CirSim.editDialog.closeDialog();
        }
    }
    
    // build a display list with all elements including ones skipped by loadCompositeXml
    Vector<CircuitElm> buildDisplayElmList() {
	Vector<CircuitElm> allElms = new Vector<CircuitElm>(compElmList);
	Vector<Element> elmEntries = model.getElmEntries();
	XMLDeserializer xml = new XMLDeserializer(app);
	int compIdx = 0;
	for (Element childElem : elmEntries) {
	    String tagName = childElem.getTagName();
	    String className = CirSim.xmlDumpTypeMap.get(tagName);
	    if (className == null)
		continue;
	    CircuitElm ce;
	    if (className.equals("WireElm") || className.equals("LabeledNodeElm") || className.equals("ScopeElm") ||
		    className.equals("GraphicElm") ||
		    (className.equals("GroundElm") && childElem.getAttribute("x") != null)) {
		ce = CirSim.constructElement(className, 0, 0);
		xml.parseChildElement(childElem);
		ce.undumpXml(xml);
		allElms.add(ce);
	    } else {
		ce = compElmList.get(compIdx++);
	    }
	    ce.setPositionFromXml(childElem);
	}
	return allElms;
    }

    boolean canViewComponents() {
	Vector<Element> elmEntries = model.getElmEntries();
	XMLDeserializer xml = new XMLDeserializer(app);
	int compIdx = 0;
	for (Element childElem : elmEntries) {
	    if (childElem.getAttribute("x") != null)
		return true;
        }
	return false;
    }

    void onDoubleClick() {
	if (canViewComponents())
	    app.ui.pushSubcircuit(this, buildDisplayElmList());
	else if (!app.ui.isReadOnly())
            app.commands.doEdit(this);
    }

    int getDumpType() { return 410; }
    String getXmlDumpType() { return "cc"; }

    String getElmType() { return "subcircuit"; }
    void getInfo(String arr[]) {
	super.getInfo(arr);
	if (model.builtin)
	    arr[0] = model.name.substring(1);
	else
	    arr[0] = "subcircuit (" + model.name + ")";
	int i;
	for (i = 0; i != postCount; i++) {
	    if (i+1 >= arr.length)
		break;
	    arr[i+1] = model.extList.get(i).name + " = " + getVoltageText(volts[i]);
	}
    }
}
