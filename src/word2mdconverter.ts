// word2mdconverter - Word to Markdown conversion tool

module Word {

    export interface Collection<T> {
        count: number;
        item(index: number): T;
    }

    export interface Font {
        bold: boolean;
        italic: boolean;
        subscript: boolean;
        superscript: boolean;
    }

    export interface Find {
        font: Font;
        format: boolean;
        replacement: Replacement;
        style: any;
        text: string;
        clearFormatting(): void;
        execute(
            findText: string,
            matchCase: boolean,
            matchWholeWord: boolean,
            matchWildcards: boolean,
            matchSoundsLike: boolean,
            matchAllWordForms: boolean,
            forward: boolean,
            wrap: number,
            format: boolean,
            replaceWith: string,
            replace: number): boolean;
    }

    export interface Replacement {
        font: Font;
        style: any;
        text: string;
        clearFormatting(): void;
    }

    export interface ListFormat {
        listLevelNumber: number;
        listString: string;
    }

    export interface Column {
    }

    export interface Columns extends Collection<Column> {
    }

    export interface Table {
        columns: Columns;
    }

    export interface Tables extends Collection<Table> {
    }

    export interface Range {
        find: Find;
        listFormat: ListFormat;
        tables: Tables;
        text: string;
        textRetrievalMode: {
            includeHiddenText: boolean;
        }
        words: Ranges;
    }

    export interface Ranges extends Collection<Range> {
    }

    export interface Style {
        nameLocal: string;
    }

    export interface Paragraph {
        alignment: number;
        range: Range;
        style: Style;
        next(): Paragraph;
    }

    export interface Paragraphs extends Collection<Paragraph> {
        first: Paragraph;
    }

    export interface Field {
    }

    export interface Fields extends Collection<Field> {
        toggleShowCodes(): void;
    }

    export interface Hyperlink {
        address: string;
        textToDisplay: string;
        range: Range;
    }

    export interface Hyperlinks extends Collection<Hyperlink> {
    }

    export interface Document {
        fields: Fields;
        paragraphs: Paragraphs;
        hyperlinks: Hyperlinks;
        builtInDocumentProperties: Collection<any>;
        close(saveChanges: boolean): void;
        range(): Range;
    }

    export interface Documents extends Collection<Document> {
        open(filename: string): Document;
    }

    export interface Application {
        documents: Documents;
        quit(): void;
    }
}

var sys = (function () {
    var fileStream = new ActiveXObject("ADODB.Stream");
    fileStream.Type = 2 /*text*/;
    var binaryStream = new ActiveXObject("ADODB.Stream");
    binaryStream.Type = 1 /*binary*/;
    var args: string[] = [];
    for (var i = 0; i < WScript.Arguments.length; i++) {
        args[i] = WScript.Arguments.Item(i);
    }
    return {
        args: args,
        createObject: (typeName: string) => new ActiveXObject(typeName),
        write(s: string): void {
            WScript.StdOut.Write(s);
        },
        writeFile: (fileName: string, data: string): void => {
            fileStream.Open();
            binaryStream.Open();
            try {
                // Write characters in UTF-8 encoding
                fileStream.Charset = "utf-8";
                fileStream.WriteText(data);
                fileStream.Position = 3;
                fileStream.CopyTo(binaryStream);
                binaryStream.SaveToFile(fileName, 2 /*overwrite*/);
            }
            finally {
                binaryStream.Close();
                fileStream.Close();
            }
        }
    };
})();

interface FindReplaceOptions {
    style?: any;
    font?: {
        bold?: boolean;
        italic?: boolean;
        subscript?: boolean;
    };
}

function convertDocumentToMarkdown(doc: Word.Document): string {

    var result: string = "";
    var lastStyle: string;
    var lastInTable: boolean;
    var tableColumnCount: number;
    var tableCellIndex: number;
    var columnAlignment: number[] = [];

    function setProperties(target: any, properties: any) {
        for (var name in properties) {
            if (properties.hasOwnProperty(name)) {
                var value = properties[name];
                if (typeof value === "object") {
                    setProperties(target[name], value);
                }
                else {
                    target[name] = value;
                }
            }
        }
    }

    function findReplace(findText: string, findOptions: FindReplaceOptions, replaceText: string, replaceOptions: FindReplaceOptions) {
        var find = doc.range().find;
        find.clearFormatting();
        setProperties(find, findOptions);
        var replace = find.replacement;
        replace.clearFormatting();
        setProperties(replace, replaceOptions);
        find.execute(findText, false, false, false, false, false, true, 0, true, replaceText, 2);
    }


    function write(s: string) {
        result += s;
    }

    function writeTableHeader() {
        for (var i = 0; i < tableColumnCount - 1; i++) {
            switch (columnAlignment[i]) {
                case 1:
                    write("|:---:");
                    break;
                case 2:
                    write("|---:");
                    break;
                default:
                    write("|---");
            }
        }
        write("|\n");
    }

    function trimEndFormattingMarks(text: string) {
        var i = text.length;
        while (i > 0 && text.charCodeAt(i - 1) < 0x20) i--;
        return text.substr(0, i);
    }

    function writeBlockEnd() {
        switch (lastStyle) {
            case "Code":
                write("```\n\n");
                break;
            case "List Paragraph":
            case "Table":
            case "TOC":
                write("\n");
                break;
        }
    }

    function writeParagraph(p: Word.Paragraph) {

        var range = p.range;
        var text = range.text;
        var style = p.style.nameLocal;
        var inTable = range.tables.count > 0;
        var level = 1;
        var sectionBreak = text.indexOf("\x0C") >= 0;

        text = trimEndFormattingMarks(text);
        if (text === "/") {
            // An inline image shows up in the text as a "/". When we see a paragraph
            // consisting of nothing but "/", we check to see if the paragraph contains
            // hidden text and, if so, emit that instead. The hidden text is assumed to
            // contain an appropriate markdown image link.
            range.textRetrievalMode.includeHiddenText = true;
            var fullText = range.text;
            range.textRetrievalMode.includeHiddenText = false;
            if (text !== fullText) {
                text = "&emsp;&emsp;" + fullText.substr(1);
            }
        }

        if (inTable) {
            style = "Table";
        }
        else if (style.match(/\s\d$/)) {
            level = +style.substr(style.length - 1);
            style = style.substr(0, style.length - 2);
        }
        if (lastStyle && style !== lastStyle) {
            writeBlockEnd();
        }

        switch (style) {

            case "Heading":
                var section = range.listFormat.listString;
                write("####".substr(0, level) + ' <a name="' + section + '"/>' + section + " " + text + "\n\n");
                break;

            case "Normal":
                if (text.length) {
                    write(text + "\n\n");
                }
                break;

            case "List Paragraph":
                write("        ".substr(0, range.listFormat.listLevelNumber * 2 - 2) + "* " + text + "\n");
                break;

            case "Table":
                if (!lastInTable) {
                    tableColumnCount = range.tables.item(1).columns.count + 1;
                    tableCellIndex = 0;
                }
                if (tableCellIndex < tableColumnCount) {
                    columnAlignment[tableCellIndex] = p.alignment;
                }
                write("|" + text);
                tableCellIndex++;
                if (tableCellIndex % tableColumnCount === 0) {
                    write("\n");
                    if (tableCellIndex === tableColumnCount) {
                        writeTableHeader();
                    }
                }
                break;

        }

        if (sectionBreak) {
            write("<br/>\n\n");
        }
        lastStyle = style;
        lastInTable = inTable;
    }

    function writeDocument() {
        var title = doc.builtInDocumentProperties.item(1) + "";
        if (title.length) {
            write("# " + title + "\n\n");
        }
        for (var p = doc.paragraphs.first; p; p = p.next()) {
            writeParagraph(p);
        }
        writeBlockEnd();
    }

    findReplace("", { font: { subscript: true } }, "<sub>^&</sub>", { font: { subscript: false } });
    findReplace("", { font: { bold: true, italic: true } }, "***^&***", { font: { bold: false, italic: false } });
    findReplace("", { font: { italic: true } }, "*^&*", { font: { italic: false } });

    doc.fields.toggleShowCodes();
    findReplace("^19 REF", {}, "[^&](#^&)", {});
    doc.fields.toggleShowCodes();

   

    writeDocument();



    return result;
}

function main(args: string[]) {
    if (args.length !== 2) {
        sys.write("Syntax: word2mdconverter <inputfile> <outputfile>\n");
        return;
    }
    var app: Word.Application = sys.createObject("Word.Application");
    var doc = app.documents.open(args[0]);
    try{
    sys.writeFile(args[1], convertDocumentToMarkdown(doc));
    }
    catch(e){
        WScript.Echo('exception');
    }    
    doc.close(false);
    app.quit();
}

main(sys.args);
