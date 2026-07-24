import { ReactNode } from "react";

// 极简 markdown 渲染：标题 / 加粗 / 行内代码 / 有序无序列表 / 段落。
// 安全实现：全部走 React 节点，不用 dangerouslySetInnerHTML。
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<code key={k++}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] | null = null;
  let para: string[] = [];
  let key = 0;
  const flushPara = () => { if (para.length) { blocks.push(<p key={key++}>{inline(para.join(" "))}</p>); para = []; } };
  const flushList = () => { if (list) { blocks.push(<ul key={key++}>{list}</ul>); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line) ?? /^\s*\d+[.、)]\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      blocks.push(<div key={key++} className={"md-h md-h" + h[1].length}>{inline(h[2])}</div>);
    } else if (li) {
      flushPara();
      (list ??= []).push(<li key={key++}>{inline(li[1])}</li>);
    } else if (line === "") {
      flushPara(); flushList();
    } else {
      flushList(); para.push(line);
    }
  }
  flushPara(); flushList();
  return <div className="md">{blocks}</div>;
}
