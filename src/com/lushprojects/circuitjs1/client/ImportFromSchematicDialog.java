package com.lushprojects.circuitjs1.client;

import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.HasHorizontalAlignment;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.user.client.ui.TextArea;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.user.client.ui.HTML;
import com.google.gwt.user.client.Window;
import com.lushprojects.circuitjs1.client.util.Locale;

public class ImportFromSchematicDialog extends Dialog {

    VerticalPanel vp;
    Button cancelButton;
    Button chooseImageButton;
    Button analyzeButton;
    Button importButton;
    TextArea circuitTextArea;
    Label statusLabel;
    Label fileNameLabel;
    HTML imagePreview;
    HorizontalPanel hp;
    static CirSim sim;
    String imageBase64;
    String imageMimeType;

    static ImportFromSchematicDialog instance;

    static final String ANALYSIS_PROMPT =
        "You are a circuit analysis expert. Analyze the schematic image and output ONLY CircuitJS1/Falstad simulator text format. " +
        "Output nothing else — no explanation, no markdown, no comments.\n\n" +
        "FORMAT RULES:\n" +
        "- First line MUST be the header: $ 1 0.000005 10.20027730826997 50 5 43 5e-11\n" +
        "- Each subsequent line is one component or wire\n" +
        "- Component format: [type] [x1] [y1] [x2] [y2] [flags] [params...]\n" +
        "- All coordinates must be multiples of 16 (snap to grid)\n" +
        "- Typical component length is 96 pixels (6 grid units)\n" +
        "- Wires connect component endpoints\n\n" +
        "COMPONENT TYPE CODES:\n" +
        "- w = wire\n" +
        "- r = resistor: r x1 y1 x2 y2 0 [resistance]\n" +
        "- c = capacitor: c x1 y1 x2 y2 0 [capacitance] [initial_voltage]\n" +
        "- l = inductor: l x1 y1 x2 y2 0 [inductance] [initial_current]\n" +
        "- v = voltage source: v x1 y1 x2 y2 0 0 [max_voltage] [frequency] [dc_offset] [duty_cycle]\n" +
        "  (for DC: v x1 y1 x2 y2 0 0 [voltage] 0 0 0)\n" +
        "- i = current source: i x1 y1 x2 y2 0 [current]\n" +
        "- d = diode: d x1 y1 x2 y2 2 default\n" +
        "- z = zener diode: z x1 y1 x2 y2 2 default\n" +
        "- 162 = LED: 162 x1 y1 x2 y2 2 default 1 0 0 [color_index]\n" +
        "- t = BJT NPN: t x1 y1 x2 y2 0 1 [vbe] [vbc] [beta]\n" +
        "- t = BJT PNP: t x1 y1 x2 y2 1 -1 [vbe] [vbc] [beta]\n" +
        "- f = MOSFET N-ch: f x1 y1 x2 y2 0 [vt]\n" +
        "- f = MOSFET P-ch: f x1 y1 x2 y2 1 [vt]\n" +
        "- s = switch (SPST): s x1 y1 x2 y2 0 [open=1/closed=0]\n" +
        "- S = switch (SPDT): S x1 y1 x2 y2 0 [position]\n" +
        "- a = op-amp: a x1 y1 x2 y2 2 [gain] 0 0 0 0 [rail_voltage]\n" +
        "- g = ground: g x1 y1 x2 y2 0\n" +
        "- R = voltage rail: R x1 y1 x2 y2 0 0 [voltage] 0 0 0\n" +
        "- T = transformer: T x1 y1 x2 y2 0 [ratio] [coupling]\n" +
        "- I = inverter: I x1 y1 x2 y2 0\n" +
        "- 150 = AND gate: 150 x1 y1 x2 y2 0 [input_count]\n" +
        "- 151 = NAND gate: 151 x1 y1 x2 y2 0 [input_count]\n" +
        "- 152 = OR gate: 152 x1 y1 x2 y2 0 [input_count]\n" +
        "- 153 = NOR gate: 153 x1 y1 x2 y2 0 [input_count]\n" +
        "- 154 = XOR gate: 154 x1 y1 x2 y2 0 [input_count]\n\n" +
        "EXAMPLE 1 — Simple resistor divider (two resistors in series with voltage source):\n" +
        "$ 1 0.000005 10.20027730826997 50 5 43 5e-11\n" +
        "v 208 352 208 160 0 0 40 5 0 0 0.5\n" +
        "r 208 160 400 160 0 10000\n" +
        "r 400 160 400 352 0 10000\n" +
        "w 400 352 208 352 0\n\n" +
        "EXAMPLE 2 — RC low-pass filter:\n" +
        "$ 1 0.000005 10.20027730826997 50 5 43 5e-11\n" +
        "v 160 336 160 144 0 1 40 1000 0 0 0.5\n" +
        "r 160 144 352 144 0 1000\n" +
        "c 352 144 352 336 0 0.000001 0\n" +
        "w 352 336 160 336 0\n\n" +
        "EXAMPLE 3 — LED with current-limiting resistor:\n" +
        "$ 1 0.000005 10.20027730826997 50 5 43 5e-11\n" +
        "v 160 336 160 144 0 0 40 5 0 0 0.5\n" +
        "r 160 144 352 144 0 330\n" +
        "162 352 144 352 336 2 default 1 0 0 3\n" +
        "w 352 336 160 336 0\n\n" +
        "Now analyze the provided schematic image and output the CircuitJS1 text format:";

    static public void setSim(CirSim csim) {
        sim = csim;
    }

    static public void onImageLoaded(String base64, String name, String mimeType) {
        if (instance == null) return;
        instance.imageBase64 = base64;
        instance.imageMimeType = mimeType;
        instance.fileNameLabel.setText(name);
        instance.imagePreview.setHTML("<img src=\"" + base64 + "\" style=\"max-width:400px;max-height:300px;\">");
        instance.analyzeButton.setEnabled(true);
        instance.statusLabel.setText("Status: Image loaded. Click Analyze.");
    }

    static public void onAnalysisComplete(String text) {
        if (instance == null) return;
        instance.circuitTextArea.setText(text);
        instance.analyzeButton.setEnabled(true);
        instance.analyzeButton.setText(Locale.LS("Analyze"));
        instance.importButton.setEnabled(true);
        instance.statusLabel.setText("Status: Analysis complete. Review and click Import Circuit.");
    }

    static public void onAnalysisError(String msg) {
        if (instance == null) return;
        instance.analyzeButton.setEnabled(true);
        instance.analyzeButton.setText(Locale.LS("Analyze"));
        instance.statusLabel.setText("Status: " + msg);
    }

    native void setupImageInput() /*-{
        var input = $doc.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.id = 'schematicImageInput';
        input.style.display = 'none';
        $doc.body.appendChild(input);
        input.addEventListener('change', function() {
            if (input.files && input.files.length > 0) {
                var file = input.files[0];
                if (file.size > 10 * 1024 * 1024) {
                    @com.lushprojects.circuitjs1.client.ImportFromSchematicDialog::onAnalysisError(Ljava/lang/String;)("Image too large (max 10MB)");
                    return;
                }
                var reader = new FileReader();
                reader.onload = function(e) {
                    var base64 = e.target.result;
                    var mimeType = file.type;
                    var name = file.name;
                    @com.lushprojects.circuitjs1.client.ImportFromSchematicDialog::onImageLoaded(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)(base64, name, mimeType);
                };
                reader.readAsDataURL(file);
            }
        });
    }-*/;

    native void clickImageInput() /*-{
        var input = $doc.getElementById('schematicImageInput');
        if (input) input.click();
    }-*/;

    native void cleanupImageInput() /*-{
        var input = $doc.getElementById('schematicImageInput');
        if (input) input.remove();
    }-*/;

    native void callGeminiApi(String base64DataUrl, String mimeType, String apiKey, String prompt) /*-{
        // Extract raw base64 from data URL
        var base64 = base64DataUrl;
        var commaIdx = base64DataUrl.indexOf(',');
        if (commaIdx >= 0) base64 = base64DataUrl.substring(commaIdx + 1);

        var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
        var body = {
            "contents": [{
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": mimeType,
                            "data": base64
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 4096
            }
        };

        $wnd.fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        .then(function(response) {
            if (response.status === 401 || response.status === 403) {
                throw new Error("Invalid API key. Click Change to update.");
            }
            if (response.status === 429) {
                throw new Error("API rate limit reached. Wait a moment and retry.");
            }
            if (!response.ok) {
                throw new Error("API error (HTTP " + response.status + "). Try again.");
            }
            return response.json();
        })
        .then(function(data) {
            var text = "";
            try {
                text = data.candidates[0].content.parts[0].text;
            } catch(e) {
                throw new Error("Could not identify circuit components. Try a clearer image.");
            }
            // Strip markdown code fences if present
            text = text.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
            if (!text || text.length < 10) {
                throw new Error("Could not identify circuit components. Try a clearer image.");
            }
            @com.lushprojects.circuitjs1.client.ImportFromSchematicDialog::onAnalysisComplete(Ljava/lang/String;)(text);
        })
        ["catch"](function(err) {
            @com.lushprojects.circuitjs1.client.ImportFromSchematicDialog::onAnalysisError(Ljava/lang/String;)(err.message || "Network error. Check connection and retry.");
        });
    }-*/;

    native String getApiKeyFromStorage() /*-{
        try {
            return $wnd.localStorage.getItem("geminiApiKey") || "";
        } catch(e) {
            return "";
        }
    }-*/;

    native void setApiKeyToStorage(String key) /*-{
        try {
            $wnd.localStorage.setItem("geminiApiKey", key);
        } catch(e) {}
    }-*/;

    String getMaskedApiKey(String key) {
        if (key == null || key.length() < 8) return "(not set)";
        return "****..." + key.substring(key.length() - 4);
    }

    public ImportFromSchematicDialog(CirSim csim) {
        super();
        setSim(csim);
        instance = this;
        closeOnEnter = false;

        vp = new VerticalPanel();
        setWidget(vp);
        setText(Locale.LS("Import from Schematic Image"));

        vp.add(new Label(Locale.LS("Select a schematic image to analyze...")));

        // Image preview area
        imagePreview = new HTML("<div style=\"width:400px;height:200px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;color:#999;background:#f9f9f9;\">No image selected</div>");
        vp.add(imagePreview);

        // File chooser row
        HorizontalPanel filePanel = new HorizontalPanel();
        filePanel.setSpacing(5);
        chooseImageButton = new Button(Locale.LS("Choose Image..."));
        filePanel.add(chooseImageButton);
        fileNameLabel = new Label("");
        filePanel.add(fileNameLabel);
        vp.add(filePanel);

        // Status label
        statusLabel = new Label("Status: Ready");
        statusLabel.setStyleName("topSpace");
        vp.add(statusLabel);

        // Circuit text area (read-only)
        circuitTextArea = new TextArea();
        circuitTextArea.setWidth("400px");
        circuitTextArea.setHeight("150px");
        circuitTextArea.setReadOnly(true);
        vp.add(circuitTextArea);

        // Button row
        hp = new HorizontalPanel();
        hp.setWidth("100%");
        hp.setSpacing(5);
        vp.add(hp);

        analyzeButton = new Button(Locale.LS("Analyze"));
        analyzeButton.setEnabled(false);
        hp.add(analyzeButton);

        importButton = new Button(Locale.LS("Import Circuit"));
        importButton.setEnabled(false);
        hp.add(importButton);

        hp.setHorizontalAlignment(HasHorizontalAlignment.ALIGN_RIGHT);
        cancelButton = new Button(Locale.LS("Cancel"));
        hp.add(cancelButton);

        // API key display row
        final Label apiKeyLabel = new Label();
        String storedKey = getApiKeyFromStorage();
        apiKeyLabel.setText("API Key: " + getMaskedApiKey(storedKey));
        HorizontalPanel keyPanel = new HorizontalPanel();
        keyPanel.setSpacing(5);
        keyPanel.add(apiKeyLabel);
        Button changeKeyButton = new Button(Locale.LS("Change"));
        keyPanel.add(changeKeyButton);
        vp.add(keyPanel);

        // Setup hidden file input
        setupImageInput();

        // Event handlers
        chooseImageButton.addClickHandler(new ClickHandler() {
            public void onClick(ClickEvent event) {
                clickImageInput();
            }
        });

        analyzeButton.addClickHandler(new ClickHandler() {
            public void onClick(ClickEvent event) {
                String apiKey = getApiKeyFromStorage();
                if (apiKey == null || apiKey.isEmpty()) {
                    apiKey = Window.prompt("Enter your Gemini API key:", "");
                    if (apiKey == null || apiKey.isEmpty()) {
                        statusLabel.setText("Status: API key required.");
                        return;
                    }
                    setApiKeyToStorage(apiKey);
                    apiKeyLabel.setText("API Key: " + getMaskedApiKey(apiKey));
                }
                if (imageBase64 == null || imageBase64.isEmpty()) {
                    statusLabel.setText("Status: Please select an image first.");
                    return;
                }
                analyzeButton.setEnabled(false);
                analyzeButton.setText("Analyzing...");
                statusLabel.setText("Status: Analyzing schematic...");
                circuitTextArea.setText("");
                importButton.setEnabled(false);
                callGeminiApi(imageBase64, imageMimeType, apiKey, ANALYSIS_PROMPT);
            }
        });

        importButton.addClickHandler(new ClickHandler() {
            public void onClick(ClickEvent event) {
                String text = circuitTextArea.getText();
                if (text == null || text.isEmpty()) {
                    statusLabel.setText("Status: No circuit text to import.");
                    return;
                }
                sim.undoManager.pushUndo();
                closeDialog();
                sim.importCircuitFromText(text, false);
            }
        });

        cancelButton.addClickHandler(new ClickHandler() {
            public void onClick(ClickEvent event) {
                closeDialog();
            }
        });

        changeKeyButton.addClickHandler(new ClickHandler() {
            public void onClick(ClickEvent event) {
                String newKey = Window.prompt("Enter your Gemini API key:", getApiKeyFromStorage());
                if (newKey != null && !newKey.isEmpty()) {
                    setApiKeyToStorage(newKey);
                    apiKeyLabel.setText("API Key: " + getMaskedApiKey(newKey));
                }
            }
        });

        this.center();
        show();
    }

    @Override
    public void closeDialog() {
        cleanupImageInput();
        instance = null;
        super.closeDialog();
    }
}
