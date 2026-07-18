import { SearchBox } from "@obcda/ui";

export const Default = () => (
  <SearchBox onSearch={(q) => console.log("search:", q)} />
);

export const WithInitialQuery = () => (
  <SearchBox initialQuery="IfcAlignment" onSearch={() => {}} />
);

export const JapaneseQuery = () => (
  <SearchBox initialQuery="属性情報" onSearch={() => {}} />
);
