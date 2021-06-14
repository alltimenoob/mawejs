//*****************************************************************************
//*****************************************************************************
//
// Save stories
//
//*****************************************************************************
//*****************************************************************************

const xmljs = require("xml-js")

const et = require("elementtree");
const {Element, SubElement, ElementTree, Comment} = et;
const fs = require("../storage/localfs");
const util = require("util");
const zlib = require("zlib");
const gzip = util.promisify(zlib.gzip);

//*
export async function mawe(file, story, compress) {

  //story.story.body._comment = "=====";
  //story.story.body.part._comment = "=====";
  //story.story.notes._comment = "=====";

  const content = xmljs.js2xml(story, {compact: true, spaces: 2});
  const buffer  = compress ? await gzip(content, {level: 9}) : content;
  fs.write(file, buffer);
}
/*/
export async function mawe(file, story, compress) {
  const root = Element("story", {
    format: story.format,
    name: story.name,
    uuid: story.uuid
  });

  root.append(Comment(" ============================================================================= "));
  root.append(Comment(" "));
  root.append(Comment(` STORY: ${story.name} `));
  root.append(Comment(" "));
  root.append(Comment(" ============================================================================= "));

  addBody(root, "body", story.body);

  root.append(Comment(" ============================================================================= "));
  root.append(Comment(" "));
  root.append(Comment(" NOTES "));
  root.append(Comment(" "));
  root.append(Comment(" ============================================================================= "));

  addNotes(root, story.notes);

  root.append(Comment(" ============================================================================= "));
  root.append(Comment(" "));
  root.append(Comment(" VERSIONS "));
  root.append(Comment(" "));
  root.append(Comment(" ============================================================================= "));

  addVersions(root, story.version);

  root.append(Comment(" ============================================================================= "));
  root.append(Comment(" "));
  root.append(Comment(" EXTRAS "));
  root.append(Comment(" "));
  root.append(Comment(" ============================================================================= "));

  addExtra(root, story.extra);

  console.log(root)
  const etree = new ElementTree(root);
  const content = etree.write({xml_declaration: false, indent: 0});
  const buffer  = compress ? await gzip(content, {level: 9}) : content;
  fs.write(file, buffer);
}

function addExtra(elem, extra) {
  extra.forEach(e => elem.append(e));
}

function addBody(parent, tag, body) {
  const elem = SubElement(parent, tag, {
    name: body.name,
    modified: Date.now().toString(),
  });
  addHead(elem, body.head);
  elem.append(Comment(" ============================================================================= "));
  addPart(elem, body.part);
  addExtra(elem, body.extra);
}

function addNotes(parent, notes) {
  const elem = SubElement(parent, "notes");
  addPart(elem, notes.part);
  addExtra(elem, notes.extra);
}

function addVersions(parent, version) {
  version.forEach(v => addBody(parent, "version", v));
}

function addHead(parent, head) {
  const elem = SubElement(parent, "head");
  //SubElement(elem, "version").text = head.version;
  SubElement(elem, "title").text = head.title;
  SubElement(elem, "subtitle").text = head.subtitle;
  SubElement(elem, "nickname").text = head.nickname;
  SubElement(elem, "author").text = head.author;
  SubElement(elem, "translated").text = head.translated;
  SubElement(elem, "status").text = head.status;
  SubElement(elem, "deadline").text = head.deadline;
  SubElement(elem, "covertext").text = head.covertext;
  SubElement(elem, "year").text = head.year;
  const words = SubElement(elem, "words")
  SubElement(words, "text").text = head.words.text;
  SubElement(words, "comments").text = head.words.comments;
  SubElement(words, "missing").text = head.words.missing;

  addExtra(elem, head.extra)
}

function addPart(parent, part) {
  part.forEach(p => {
    const elem = SubElement(parent, "part");
    p.scene.forEach(s => {
      const scene = SubElement(elem, "scene", {name: s.name});
      s.content.forEach(c => {
        scene.append(c);
      })
    })
  });
}
/**/