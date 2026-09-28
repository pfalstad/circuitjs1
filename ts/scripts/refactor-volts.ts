import { Project, SyntaxKind, Node } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: './tsconfig.json', // Make sure this points to your tsconfig
});

const sourceFiles = project.addSourceFilesAtPaths('*.ts*'); // Adjust glob as needed

let changedCount = 0;

sourceFiles.forEach(sourceFile => {
  console.log(sourceFile);
  sourceFile.forEachDescendant(node => {
    if (!node.isKind(SyntaxKind.ElementAccessExpression)) return;

    const expr = node.getExpression();
    if (expr.getText() !== 'this.volts') return;

    const argument = node.getArgumentExpression();
    if (!argument) return;

    // Check if this is on the LEFT side of an assignment (e.g. this.volts[i] = x)
    const parent = node.getParent();
    const isAssignment = parent?.isKind(SyntaxKind.BinaryExpression) &&
                         parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
                         parent.getLeft() === node;

    if (isAssignment) {
      console.log(`Skipping assignment: ${node.getText()}`);
      return; // Leave it alone
    }

    // It's a read → safe to transform
    const newText = `this.nodes[${argument.getText()}].v`;
    node.replaceWithText(newText);
    changedCount++;
  });
});

console.log(`\n✅ Done! Changed ${changedCount} references.`);
project.saveSync();
