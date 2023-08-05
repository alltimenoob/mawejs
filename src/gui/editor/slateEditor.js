//*****************************************************************************
//*****************************************************************************
//
// Nested editing with SlateJS
//
//*****************************************************************************
//*****************************************************************************

import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { useSlate, Editable, withReact, ReactEditor } from 'slate-react'
import {
  Editor,
  Node, Text,
  Transforms,
  Range, Point, Path,
  createEditor,
  Element,
} from 'slate'

import { withHistory } from "slate-history"
import { addClass, Icon } from '../common/factory';
import { nanoid } from '../../util';
import {section2lookup, wcElem} from '../../document/util';
import isHotkey from 'is-hotkey';

import {
  text2Regexp, searchOffsets, searchPattern,
  isAstChange,
  searchFirst, searchForward, searchBackward,
  focusByID, focusByPath,
  hasElem,
  elemPushTo, elemPop,
  elemIsBlock,
} from "./slateHelpers"

export {
  text2Regexp,
  isAstChange,
  searchFirst, searchForward, searchBackward,
  focusByID, focusByPath,
  hasElem,
  elemPushTo, elemPop,
}

//-----------------------------------------------------------------------------
//
// Short description of buffer format:
//
// children = [
//  part: [
//    hpart (part header/name)
//    scene: [
//      hscene (scene header/name)
//      paragraph
//      paragraph
//      ...
//    ]
//    scene
//    scene
//  ]
//  part
//  part
//]
//
//-----------------------------------------------------------------------------

//*****************************************************************************
//
// Buffer rendering
//
//*****************************************************************************

function renderElement({element, attributes, ...props}) {

  const {children} = props
  const {name, type, folded} = element

  const foldClass = folded ? "folded" : ""

  switch (type) {
    case "part":
      return <div className={addClass("part", foldClass)} {...attributes} {...props}/>

    case "scene":
      return <div className={addClass("scene", foldClass)} {...attributes} {...props}/>

    case "hpart": return <h5 {...attributes} {...props}/>
    case "hscene": return <h6 {...attributes} {...props}/>

    case "comment":
    case "missing":
    case "synopsis":
      return <p className={element.type} {...attributes} {...props}/>

    case "p":
    default: break;
  }

  if (Node.string(element) === "") {
    return <div className="emptyline" {...attributes} {...props}/>
  }
  return <p {...attributes} {...props}/>
}

function renderLeaf({ leaf, attributes, children}) {
  return <span
    className={leaf.highlight ? "highlight" : undefined}
    {...attributes}
  >{children}</span>
}

export function SlateEditable({className, highlight, ...props}) {
  //console.log("Search:", search)

  const editor = useSlate()

  const _onKeyDown = useCallback(event => onKeyDown(event, editor), [editor])

  const re = useMemo(() => searchPattern(highlight), [highlight])

  const highlighter = useCallback(
    re
    ?
    ([node, path]) => {
      if (!Text.isText(node)) return []

      const offsets = searchOffsets(Node.string(node), re)
      const ranges = offsets.map(offset => ({
        anchor: {path, offset},
        focus: {path, offset: offset + highlight.length},
        highlight: true,
      }))
      //if(ranges.length) console.log(ranges)

      return ranges
    }
    :
    undefined,
    [re]
  )

  return <Editable
    className={className}
    spellCheck={false} // Keep false until you find out how to change language
    renderElement={renderElement}
    renderLeaf={renderLeaf}
    decorate={highlighter}
    onKeyDown={_onKeyDown}
    {...props}
  />
}

//-----------------------------------------------------------------------------

const isKey_AltF = isHotkey("Alt+F")
const isKey_AltA = isHotkey("Alt+A")
const isKey_AltS = isHotkey("Alt+S")

const isKey_AltUp = isHotkey("Alt+Up")
const isKey_AltDown = isHotkey("Alt+Down")

function onKeyDown(event, editor) {

  //---------------------------------------------------------------------------
  // Folding
  //---------------------------------------------------------------------------

  if (isKey_AltF(event)) {
    event.preventDefault()
    toggleFold(editor)
    return
  }
  if (isKey_AltA(event)) {
    event.preventDefault()
    foldAll(editor, true)
    return
  }
  if (isKey_AltS(event)) {
    event.preventDefault()
    foldAll(editor, false)
    return
  }

  //---------------------------------------------------------------------------
  // Moving
  //---------------------------------------------------------------------------

  if(isKey_AltUp(event)) {
    event.preventDefault()

    const current = Editor.above(editor, {
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(!current) return

    const match = Editor.previous(editor, {
      at: current[1],
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(match) {
      const [,path] = match
      Transforms.select(editor, path)
      Transforms.collapse(editor)
    }
    return
  }

  if(isKey_AltDown(event)) {
    event.preventDefault()

    const current = Editor.above(editor, {
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(!current) return

    const match = Editor.next(editor, {
      at: current[1],
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(match) {
      const [,path] = match
      Transforms.select(editor, path)
      Transforms.collapse(editor)
    }
    return
  }

  //---------------------------------------------------------------------------
  // Misc
  //---------------------------------------------------------------------------

  if(isHotkey("Alt+L", event)) {
    event.preventDefault()
    Transforms.insertText(editor,
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque sagittis " +
      "faucibus odio, sed fringilla lacus tempor eu. Curabitur lacinia ante quis " +
      "urna placerat, vitae ullamcorper dolor accumsan. Nam ex velit, dictum eget " +
      "porttitor vitae, aliquet at tortor. Vivamus dictum mauris ut dolor mattis, " +
      "ut pulvinar ligula scelerisque. Vivamus luctus neque nec urna sodales " +
      "fringilla. Ut gravida nibh risus, ac tempus mauris scelerisque nec. Vivamus " +
      "semper erat eget placerat imperdiet. Fusce non lorem eu diam vulputate porta " +
      "non eu nibh. Mauris egestas est tellus, id placerat libero tempus et. " +
      "Integer eget ultrices ante. Vestibulum est arcu, elementum a ornare convallis, " +
      "fringilla."
    )
    return
    }
}

//*****************************************************************************
//
// Folding
//
//*****************************************************************************

function foldAll(editor, folded) {
  const matches = Editor.nodes(editor, {
    at: [],
    match: n => Element.isElement(n) && n.type === "part"
  })
  for(const [node, path] of matches) {
    doFold(editor, node, path, folded)
  }

  Transforms.select(editor, [0])
  Transforms.collapse(editor)
}

function toggleFold(editor) {
  const { selection } = editor

  if(!selection) return
  if(!Range.isCollapsed(selection)) return

  const { anchor } = selection
  //const [node, path] = Editor.node(editor, anchor)
  //console.log("Toggle fold", path, node)

  const [node, path] = Editor.above(editor, {
    at: anchor,
    match: n => Element.isElement(n) && (n.type === "scene" || n.type === "part"),
  })

  const folded = !node.folded
  doFold(editor, node, path, folded)

  Transforms.select(editor, path)
  Transforms.collapse(editor)
}

//-----------------------------------------------------------------------------

function doFold(editor, node, path, folded) {

  if((node.folded ?? false) === folded) return;

  Transforms.setNodes(editor, {folded}, {at: path})
}

//*****************************************************************************
//
// Editor customizations
//
//*****************************************************************************

export function getEditor() {

  return [
    createEditor,
    withHistory,
    withMarkup,
    withFixNesting,
    withIDs,              // Autogenerate IDs
    withProtectFolds,     // Keep low! Prevents messing with folded blocks
    withReact,
  ].reduce((editor, func) => func(editor), undefined)
}

//-----------------------------------------------------------------------------
// Folded block protection: The main principle is to protect the hidden block
// from changes. If it can't be prevented, the block is unfolded.
//-----------------------------------------------------------------------------

/*
function cursorInFolded(editor) {
  const {selection} = editor

  if(!selection) return false
  if(!Range.isCollapsed(selection)) return false

  //const { anchor } = selection
  const match = Editor.above(editor, {
    match: n => Element.isElement(n) && (n.type === "fold" || n.folded),
  })

  if(match) return true
  return false
}
*/

function withProtectFolds(editor) {
  const {
    deleteBackward, deleteForward,
    insertText, insertBreak,
    apply,
  } = editor

  function unfoldSelection() {
    const match = Editor.above(editor, {
      match: n => Element.isElement(n) && n.folded,
    })
    if(!match) return false
    const [node, path] = match
    doFold(editor, node, path, false)
    return true
  }

  editor.insertBreak = () => {
    if(!unfoldSelection()) insertBreak()
  }

  editor.deleteBackward = (options) => {
    unfoldSelection()
    deleteBackward(options)
  }

  editor.deleteForward = (options) => {
    unfoldSelection()
    deleteForward(options)
  }

  editor.insertText = (text, options) => {
    unfoldSelection()
    //console.log("insertText", text, options)
    insertText(text, options)
  }

  /*
  const {isVoid} = editor
  editor.isVoid = elem => {
    if(elem.type === "fold") return true
    return isVoid(elem)
  }
  */

  return editor
}

//-----------------------------------------------------------------------------
// Markup shortcuts
//-----------------------------------------------------------------------------

function withMarkup(editor) {

  //---------------------------------------------------------------------------
  // Markup shortcuts to create styles

  const SHORTCUTS = {
    '** ': {type: "hpart"},
    '## ': {type: "hscene"},
    '>> ': {type: "synopsis"},
    '// ': {type: 'comment'},
    '!! ': {type: 'missing'},
    //'-- ': ,
    //'++ ': ,
    //'<<':
    //'((':
    //'))':
    //'==':
    //'??':
    //'++':
    //'--':
    //'%%':
    //'/*':
    //'::':
  }

  const STYLEAFTER = {
    "hpart": "hscene",
    "hscene": "p",
    "synopsis": "p",
    "missing": "p",
  }

  const RESETEMPTY = [
    "synopsis",
    "comment",
    "missing",
  ]

  const { insertText } = editor

  editor.insertText = text => {
    const { selection } = editor

    if(!selection) return insertText(text)
    if(!Range.isCollapsed(selection)) return insertText(text)

    const { anchor } = selection
    const [node, path] = Editor.above(editor, {
      match: n => Editor.isBlock(editor, n),
    })

    //const path = node ? node[1] : []
    const start = Editor.start(editor, path)
    const range = { anchor, focus: start }
    const key = Editor.string(editor, range) + text

    if(key in SHORTCUTS) {
      Transforms.select(editor, range)
      Transforms.delete(editor)
      Transforms.setNodes(editor, SHORTCUTS[key])
      return
    }

    insertText(text)
  }

  //---------------------------------------------------------------------------
  // Default styles followed by a style

  const { insertBreak } = editor

  editor.insertBreak = () => {
    const { selection } = editor

    if(!selection) return insertBreak()
    if(!Range.isCollapsed(selection)) return insertBreak()

    const [node, path] = Editor.above(editor, {
      match: n => Editor.isBlock(editor, n),
    })

    // If we hit enter at empty line, and block type is RESETEMPTY, reset type
    if(RESETEMPTY.includes(node.type) && Node.string(node) == "") {
      Transforms.setNodes(editor, {type: "p"});
      return
    }

    // If we hit enter at line, which has STYLEAFTER, split line and apply style
    if(node.type in STYLEAFTER) {
      const newtype = STYLEAFTER[node.type]
      Editor.withoutNormalizing(editor, () => {
        Transforms.splitNodes(editor, {always: true})
        Transforms.setNodes(editor, {type: newtype})
      })
      return
    }

    insertBreak()
  }

  //---------------------------------------------------------------------------
  // Backspace at the start of line resets formatting

  const { deleteBackward } = editor;

  editor.deleteBackward = (...args) => {
    const { selection } = editor

    if(!selection) return deleteBackward(...args)
    if(!Range.isCollapsed(selection)) return deleteBackward(...args)

    // Which block we are:
    const match = Editor.above(editor, {
      match: n => Editor.isBlock(editor, n),
    })
    if(!match) return deleteBackward(...args)

    const [node, path] = match

    if(!elemIsBlock(editor, node)) return deleteBackward(...args)

    // Beginning of line?
    if(!Point.equals(selection.anchor, Editor.start(editor, path))) return deleteBackward(...args)

    switch(node.type) {
      case "missing":
      case "comment":
      case "synopsis":
      case "hpart":
      case "hscene":
        // Remove formatting
        Transforms.setNodes(editor, {type: 'p'})
        return
      default: break;
    }

    return deleteBackward(...args)
  }

  return editor
}

//-----------------------------------------------------------------------------
// Ensure that indexable blocks have unique ID
//-----------------------------------------------------------------------------

function withIDs(editor) {

  const { normalizeNode } = editor;

  editor.normalizeNode = (entry)=> {
    const [node, path] = entry

    // When argument is whole editor (all blocks)
    if(path.length > 0) return normalizeNode(entry);

    //console.log("Path/Node:", path, node)

    const blocks = Editor.nodes(editor, {
      at: [],
      match: (node, path) => !Editor.isEditor(node) && Element.isElement(node),
    })

    //console.log(Array.from(blocks))

    const ids = new Set()

    for(const block of blocks) {
      const [node, path] = block

      if(!node.id || ids.has(node.id)) {
        console.log("ID clash fixed:", path)
        const id = nanoid()
        Transforms.setNodes(editor, {id}, {at: path})
        ids.add(id)
      }
      else {
        ids.add(node.id)
      }
    }

    return normalizeNode(entry)
  }

  return editor
}

//-----------------------------------------------------------------------------
// Try to maintain buffer integrity:
//-----------------------------------------------------------------------------

function getParent(editor, path, ...types) {
  const parent = Editor.above(
    editor,
    {
      at: path,
      match: n => Element.isElement(n) && types.includes(n.type)
    }
  )
  return parent
}

function withFixNesting(editor) {

  const { normalizeNode } = editor;

  // The order of nodes coming to be normalized is bottom-up:
  // first comes the text block, then the paragraph block containing the text,
  // then the scene where paragraph belongs to, then part, and finally the
  // editor itself.

  editor.normalizeNode = entry => {
    const [node, path] = entry

    //console.log("Fix:", path, node)

    if(Text.isText(node)) return normalizeNode(entry)

    if(Editor.isEditor(node)) {
      const [first, at] = Editor.node(editor, [0, 0])
      //console.log("First:", first)
      if(first.type === "hpart") return normalizeNode(entry)
      //*
      if(first.type === "scene") {
        Transforms.unwrapNodes(editor, {at})
      }
      Transforms.setNodes(editor, {type: "hpart"}, {at})
      /**/
      return
    }

    switch(node.type) {
      // Paragraph styles come first
      case "hpart":
        if(!checkParent(node, path, "part")) return
        if(!checkIsFirst(node, path, "part")) return
        if(!updateParentName(node, path)) return
        break;
      case "hscene":
        if(!checkParent(node, path, "scene")) return
        if(!checkIsFirst(node, path, "scene")) return;
        if(!updateParentName(node, path)) return
        break;
      default:
        if(!checkParent(node, path, "scene")) return
        break;

      // Block styles come next
      case "part": {
        if(path.length > 1) {
          Transforms.liftNodes(editor, {at: path})
          return;
        }
        if(!checkBlockHeader(node, path, "hpart")) return
        if(node.children.length > 1 && !checkFirstHeader(node.children[1], [...path, 1], "hscene")) return
        break;
      }
      case "scene": {
        if(path.length < 2) {
          Transforms.wrapNodes(editor, {type: "part"}, {at: path})
          return;
        } else if(path.length > 2) {
          Transforms.liftNodes(editor, {at: path})
          return
        }
        if(!checkBlockHeader(node, path, "hscene")) return
        break
      }
    }
    //return
    return normalizeNode(entry)
  }

  return editor

  //---------------------------------------------------------------------------
  // Check, that paragraphs are parented to scenes, and scenes are parented to
  // parts: if not, put it into a scene wrapping and let further processing
  // merge it.
  //---------------------------------------------------------------------------

  function checkParent(node, path, type) {
    //console.log("FixNesting: Check parent", node, path, type)
    const [parent, ppath] = Editor.parent(editor, path)

    if(parent.type === type) return true

    //console.log("FixNesting: Wrapping", path, node, type)
    Transforms.wrapNodes(editor, {type}, {at: path})
    return false
  }

  //---------------------------------------------------------------------------
  // Check, if header is at the beginning of block - if not, make it one.
  //---------------------------------------------------------------------------

  function checkIsFirst(node, path, type) {
    const index = path[path.length-1]

    //console.log("hscene", parent)

    if(!index) return true

    //console.log("FixNesting: Splitting", path, hscene, "scene")
    Editor.withoutNormalizing(editor, () => {
      Transforms.wrapNodes(editor, {type}, {at: path})
      Transforms.liftNodes(editor, {at: path})
    })
    return false
  }

  function updateParentName(node, path) {
    //console.log("Update name:", node, path)
    const [parent, at] = Editor.parent(editor, path)
    //console.log("- Parent:", parent, at)

    const {name} = parent
    const text = Node.string(node)
    if(name === text) return true
    Transforms.setNodes(editor, {name: text}, {at})
    return false
  }

  //---------------------------------------------------------------------------
  // Ensure, that blocks have correct header element
  //---------------------------------------------------------------------------

  function checkBlockHeader(block, path, type) {

    //if(block.folded) return true;

    if(!block.children.length) {
      Transforms.removeNodes(editor, {at: path})
      return false;
    }

    const hdrtype = block.children[0].type

    // Does the block have correct header type?
    if(hdrtype === type) return true

    const prev = Editor.previous(editor, {at: path})

    if(!prev) return true
    if(prev[0].type !== block.type) return true

    doFold(editor, prev[0], prev[1], false)
    doFold(editor, block, path, false)
    Transforms.mergeNodes(editor, {at: path})

    return false
  }

  function checkFirstHeader(block, path, type) {

    const hdrtype = block.children[0].type

    // Does the block have correct header type?
    if(hdrtype === type) return true

    //Transforms.insertNodes(editor, {type, children: [{text:""}]}, {at: [...path, 0]})
    Transforms.setNodes(editor, {type}, {at: [...path, 0]})
    return false
  }
}

//*****************************************************************************
//
// Doc --> Slate
//
//*****************************************************************************

export function section2edit(section) {
  //console.log(section)
  //return section2flat(section).map(elem2edit)

  return section.parts.map(part2edit)

  function part2edit(part) {
    const {children, type, id, name, folded} = part

    return {
      type: "part",
      name,
      id,
      folded,
      children: [
        {type: "hpart", id: nanoid(), children: [{text: name ?? ""}]},
        ...children.map(scene2edit)
      ],
    }
  }

  function scene2edit(scene) {
    const {type, id, name, children, folded} = scene

    return {
      type: "scene",
      name,
      id,
      folded,
      children: [
        {type: "hscene", id: nanoid(), children: [{text: name ?? ""}]},
        ...children.map(elem2edit)
      ]
    }
  }

  function elem2edit(elem) {
    const {type} = elem;

    if(type === "br") return {...elem, type: "p"}
    return elem
  }
}

//*****************************************************************************
//
// Slate --> Doc
//
//*****************************************************************************

//-----------------------------------------------------------------------------
// Update parts & scenes: To make index rendering faster, we preserve the
// doc elements whenever possible. Also, during the update we refresh the
// word counts so that there is no need to recalculate them before rendering
// index.
//-----------------------------------------------------------------------------

export function updateSection(buffer, section) {

  //console.log("Update section")

  const lookup = section ? section2lookup(section) : {}
  //console.log(lookup)

  //console.log(buffer)

  const updated = buffer.map(part => edit2part(part, lookup))
  const isClean = cmpList(updated, section.parts)

  if(isClean) return section

  return {
    ...section,
    parts: updated,
    words: wcElem({type: "sect", children: updated})
  }
}

function edit2part(part, lookup) {
  //console.log(part)

  const {id, name, folded, children} = part

  const [head, ...scenes] = children

  //console.log("Head", head, "Scenes:", scenes)

  return checkClean({
    type: "part",
    id,
    name,
    folded,
    children: scenes.map(scene => edit2scene(scene, lookup)),
  }, lookup)
}

// Update scene

function edit2scene(scene, lookup) {
  const {id, name, folded, children} = scene
  const [head, ...paragraphs] = children

  //console.log("Head", head, "Paragraphs:", paragraphs)

  return checkClean({
    type: "scene",
    id,
    name,
    folded,
    children: paragraphs.map(p => edit2paragraph(p, lookup))
  }, lookup)
}

// Update paragraph

function edit2paragraph(elem, lookup) {
  return checkClean(elem, lookup)
}

function checkClean(elem, lookup) {
  const {id} = elem

  if(lookup.has(id)) {
    const orig = lookup.get(id)

    if(elem === orig) return orig

    if(cmpType(elem, orig)) switch(elem.type) {
      case "part":
      case "scene":
        if(cmpNamedGroup(elem, orig)) return orig
        break;
      case "br": return orig;
      default:
        if(elem.children[0].text === orig.children[0].text) return orig
        break;
    }
    //console.log(`Update ${elem.type}:`, id)
  } else {
    //console.log(`Create ${elem.type}`, id)
  }

  return {
    ...elem,
    words: wcElem(elem)
  }
}

function cmpNamedGroup(elem, orig) {
  return (
    cmpTypeName(elem, orig) &&
    elem.folded === orig.folded &&
    cmpChildren(elem, orig)
  )
}

function cmpChildren(elem, orig) {
  return cmpList(elem.children, orig.children)
}

function cmpTypeName(elem, orig) {
  return (
    cmpType(elem, orig) &&
    elem.name === orig.name
  )
}

function cmpType(elem, orig) {
  return (
    elem.id === orig.id &&
    elem.type === orig.type
  )
}

function cmpList(a, b) {
  if(a === b) return true
  if(a.length !== b.length) return false
  return a.every((elem, index) => elem === b[index])
}
