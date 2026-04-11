import { TapemarkLayout } from "./TapemarkLayout";

export interface DatabaseListItem {
  name: string;
  path: string;
}

interface DatabaseListPageProps {
  databases: DatabaseListItem[];
}

export function DatabaseListPage({ databases }: DatabaseListPageProps) {
  return (
    <TapemarkLayout
      title="databases"
      prefix=""
      name="tapemark"
      symbol="🎞️"
    >
      <h2 class="tm-section-title">databases</h2>
      <table class="tm-table-compact">
        <thead>
          <tr>
            <th>name</th>
            <th>path</th>
          </tr>
        </thead>
        <tbody>
          {databases.map((db) => (
            <tr>
              <td>
                <a href={`/${db.name}`}>{db.name}</a>
              </td>
              <td class="tm-muted">{db.path}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TapemarkLayout>
  );
}
