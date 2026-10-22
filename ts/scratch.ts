import { Color } from "./Color";
import { Point } from "./Point";

const c = new Color(100, 150, 200);
console.log(c.getHexValue());
console.log(Color.red.toString());
console.log(new Color(Color.black, Color.white, 0.5).getHexValue());

const p = new Point(10, 20);
p.move(1, 5);
console.log(p);

