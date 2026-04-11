import { DatabaseListPage, type DatabaseListItem } from "./components/DatabaseListPage";
import { renderPage } from "./render";

export function renderDatabaseListPage(databases: DatabaseListItem[]): string {
  return renderPage(<DatabaseListPage databases={databases} />);
}
