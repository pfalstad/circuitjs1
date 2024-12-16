package com.lushprojects.circuitjs1.client.generator;

import com.google.gwt.core.ext.Generator;
import com.google.gwt.core.ext.GeneratorContext;
import com.google.gwt.core.ext.TreeLogger;
import com.google.gwt.core.ext.UnableToCompleteException;
import com.google.gwt.core.ext.typeinfo.JClassType;
import com.google.gwt.core.ext.typeinfo.JConstructor;
import com.google.gwt.core.ext.typeinfo.JParameter;
import com.google.gwt.core.ext.typeinfo.TypeOracle;
import com.google.gwt.user.rebind.ClassSourceFileComposerFactory;
import com.google.gwt.user.rebind.SourceWriter;

import java.io.PrintWriter;

public class ElementFactoryGenerator extends Generator {

    boolean hasTwoIntConstructor(JClassType classType) {
	JConstructor[] constructors = classType.getConstructors();

	// Iterate over all constructors
	for (JConstructor constructor : constructors) {
	    JParameter[] params = constructor.getParameters();
	    
	    // Check if the constructor has exactly two parameters
	    if (params.length == 2) {
		// Check if both parameters are of type int
		if (params[0].getType().getQualifiedSourceName().equals("int") &&
		    params[1].getType().getQualifiedSourceName().equals("int")) {
		    return true;
		}
	    }
	}

	return false;
    }

    boolean hasFiveIntConstructor(JClassType classType) {
	JConstructor[] constructors = classType.getConstructors();

	// Iterate over all constructors
	for (JConstructor constructor : constructors) {
	    JParameter[] params = constructor.getParameters();
	    
	    if (params.length == 6) {
		int i;
		for (i = 0; i != 5; i++)
		    if (!params[i].getType().getQualifiedSourceName().equals("int"))
			return false;
		return true;
	    }
	}

	return false;
    }
    @Override
    public String generate(TreeLogger logger, GeneratorContext context, String typeName) throws UnableToCompleteException {
        TypeOracle typeOracle = context.getTypeOracle();
        JClassType classType = typeOracle.findType(typeName);

        if (classType == null) {
            logger.log(TreeLogger.ERROR, "Unable to find metadata for type '" + typeName + "'");
            throw new UnableToCompleteException();
        }

        if (classType.isInterface() == null) {
            logger.log(TreeLogger.ERROR, typeName + " is not an interface");
            throw new UnableToCompleteException();
        }

        String packageName = classType.getPackage().getName();
        String simpleName = classType.getSimpleSourceName() + "Impl";

        PrintWriter pw = context.tryCreate(logger, packageName, simpleName);
        if (pw != null) {
            ClassSourceFileComposerFactory composerFactory = new ClassSourceFileComposerFactory(packageName, simpleName);
            composerFactory.addImplementedInterface(typeName);

            SourceWriter sw = composerFactory.createSourceWriter(context, pw);

            // Find all subtypes of CircuitElm
            JClassType circuitElmType = typeOracle.findType("com.lushprojects.circuitjs1.client.CircuitElm");
            if (circuitElmType == null) {
                logger.log(TreeLogger.ERROR, "Cannot find CircuitElm class");
                throw new UnableToCompleteException();
            }

            sw.println("public " + simpleName + "() {}");
            sw.println("@Override");
            sw.println("public CircuitElm create(String className, int x1, int y1) {");
            sw.indent();

            JClassType[] subtypes = circuitElmType.getSubtypes();
            for (JClassType subtype : subtypes) {
		if (subtype.isAbstract() || !hasTwoIntConstructor(subtype))
		    continue;
                String simpleClassName = subtype.getSimpleSourceName();
System.out.println("class " + simpleClassName);
                sw.println("if (\"" + simpleClassName + "\".equals(className)) {");
                sw.indent();
                sw.println("return new " + subtype.getQualifiedSourceName() + "(x1, y1);");
                sw.outdent();
                sw.println("}");
            }

            sw.println("return null; // Unknown class name");
            sw.outdent();
            sw.println("}");

            sw.println("@Override");
            sw.println("public CircuitElm create(String className, int x1, int y1, int x2, int y2, int f, StringTokenizer st) {");
            sw.indent();

            for (JClassType subtype : subtypes) {
		if (subtype.isAbstract() || !hasFiveIntConstructor(subtype))
		    continue;
                String simpleClassName = subtype.getSimpleSourceName();
System.out.println("class " + simpleClassName);
                sw.println("if (\"" + simpleClassName + "\".equals(className)) {");
                sw.indent();
                sw.println("return new " + subtype.getQualifiedSourceName() + "(x1, y1, x2, y2, f, st);");
                sw.outdent();
                sw.println("}");
            }
            sw.println("return null; // Unknown class name");
            sw.outdent();
            sw.println("}");

	/*
            sw.println("public String[] getClassList() { return new String[] { ");
            sw.indent();

            for (JClassType subtype : subtypes) {
		if (subtype.isAbstract() || !hasFiveIntConstructor(subtype))
		    continue;
                String simpleClassName = subtype.getSimpleSourceName();
System.out.println("class " + simpleClassName);
                sw.println("\"" + simpleClassName + "\",");
            }
            sw.println("};");
            sw.outdent();
            sw.println("}");
	*/

            sw.commit(logger);
        }

        return packageName + "." + simpleName;
    }
}
