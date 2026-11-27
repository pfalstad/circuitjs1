/* StringTokenizer -- breaks a String into tokens
Copyright (C) 1998, 1999, 2001, 2002, 2005  Free Software Foundation, Inc.

This file is part of GNU Classpath.

GNU Classpath is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2, or (at your option)
any later version.

GNU Classpath is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License
along with GNU Classpath; see the file COPYING.  If not, write to the
Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA
02110-1301 USA. */

/**
 * This class splits a string into tokens.  The caller can set on which
 * delimiters the string should be split and if the delimiters should be
 * returned. This is much simpler than StreamTokenizer.
 *
 * You may change the delimiter set on the fly by calling
 * nextToken(String).  But the semantic is quite difficult; it even
 * depends on calling hasMoreTokens().  You should call
 * hasMoreTokens() before, otherwise the old delimiters
 * after the last token are candidates for being returned.
 *
 * If you want to get the delimiters, you have to use the three argument
 * constructor.  The delimiters are returned as token consisting of a
 * single character.
 *
 * @author Jochen Hoenicke
 * @author Warren Levy (warrenl@cygnus.com)
 */
export class StringTokenizer {
    // WARNING: StringTokenizer is a CORE class in the bootstrap cycle. See the
    // comments in vm/reference/java/lang/Runtime for implications of this fact.

    /**
     * The position in the str, where we currently are.
     */
    private pos: number;

    /**
     * The string that should be split into tokens.
     */
    private readonly str: string;

    /**
     * The length of the string.
     */
    private readonly len: number;

    /**
     * The string containing the delimiter characters.
     */
    private delim: string;

    /**
     * Tells, if we should return the delimiters.
     */
    private readonly retDelims: boolean;

    /**
     * Creates a new StringTokenizer for the string str,
     * that should split on the default delimiter set (space, tab,
     * newline, return and formfeed), and which doesn't return the
     * delimiters.
     *
     * @param str The string to split
     */
    constructor(str: string);
    /**
     * Create a new StringTokenizer, that splits the given string on
     * the given delimiter characters.  It doesn't return the delimiter
     * characters.
     *
     * @param str the string to split
     * @param delim a string containing all delimiter characters
     */
    constructor(str: string, delim: string);
    /**
     * Create a new StringTokenizer, that splits the given string on
     * the given delimiter characters.  If you set
     * returnDelims to true, the delimiter characters are returned as
     * tokens of their own.  The delimiter tokens always consist of a
     * single character.
     *
     * @param str the string to split
     * @param delim a string containing all delimiter characters
     * @param returnDelims tells, if you want to get the delimiters
     */
    constructor(str: string, delim: string, returnDelims: boolean);
    constructor(str: string, delim: string = " \t\n\r\f", returnDelims: boolean = false) {
        this.len = str.length;
        this.str = str;
        this.delim = delim;
        this.retDelims = returnDelims;
        this.pos = 0;
    }

    /**
     * Tells if there are more tokens.
     *
     * @return true if the next call of nextToken() will succeed
     */
    hasMoreTokens(): boolean {
        if (!this.retDelims) {
            while (this.pos < this.len && this.delim.indexOf(this.str.charAt(this.pos)) >= 0)
                this.pos++;
        }
        return this.pos < this.len;
    }

    /**
     * Returns the nextToken, changing the delimiter set to the given
     * delim.  The change of the delimiter set is permanent, ie. the
     * next call of nextToken(), uses the same delimiter set.
     *
     * @param delim a string containing the new delimiter characters
     * @return the next token with respect to the new delimiter characters
     */
    nextToken(delim?: string): string {
        if (delim !== undefined)
            this.delim = delim;
        if (this.pos < this.len && this.delim.indexOf(this.str.charAt(this.pos)) >= 0) {
            if (this.retDelims)
                return this.str.substring(this.pos, ++this.pos);
            while (++this.pos < this.len && this.delim.indexOf(this.str.charAt(this.pos)) >= 0)
                ;
        }
        if (this.pos < this.len) {
            const start = this.pos;
            while (++this.pos < this.len && this.delim.indexOf(this.str.charAt(this.pos)) < 0)
                ;
            return this.str.substring(start, this.pos);
        }
        throw new Error("NoSuchElementException");
    }

    /**
     * This does the same as hasMoreTokens. This is the
     * Enumeration interface method.
     *
     * @return true, if the next call of nextElement() will succeed
     */
    hasMoreElements(): boolean {
        return this.hasMoreTokens();
    }

    /**
     * This does the same as nextTokens. This is the
     * Enumeration interface method.
     *
     * @return the next token with respect to the current delimiter characters
     */
    nextElement(): string {
        return this.nextToken();
    }

    /**
     * This counts the number of remaining tokens in the string, with
     * respect to the current delimiter set.
     *
     * @return the number of times nextTokens() will succeed
     */
    countTokens(): number {
        let count = 0;
        let delimiterCount = 0;
        let tokenFound = false; // Set when a non-delimiter is found
        let tmpPos = this.pos;

        // Note for efficiency, we count up the delimiters rather than check
        // retDelims every time we encounter one.  That way, we can
        // just do the conditional once at the end of the method
        while (tmpPos < this.len) {
            if (this.delim.indexOf(this.str.charAt(tmpPos++)) >= 0) {
                if (tokenFound) {
                    // Got to the end of a token
                    count++;
                    tokenFound = false;
                }
                delimiterCount++; // Increment for this delimiter
            } else {
                tokenFound = true;
                // Get to the end of the token
                while (tmpPos < this.len && this.delim.indexOf(this.str.charAt(tmpPos)) < 0)
                    ++tmpPos;
            }
        }

        // Make sure to count the last token
        if (tokenFound)
            count++;

        // if counting delmiters add them into the token count
        return this.retDelims ? count + delimiterCount : count;
    }
}
