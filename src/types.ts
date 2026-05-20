// ─── Smartsheet Core Types ──────────────────────────────────────────────────

export interface SmartsheetSheet {
  id: number;
  name: string;
  accessLevel?: string;
  permalink?: string;
  createdAt?: string;
  modifiedAt?: string;
  totalRowCount?: number;
  columns?: SmartsheetColumn[];
  rows?: SmartsheetRow[];
}

export interface SmartsheetColumn {
  id: number;
  index: number;
  title: string;
  type: string;
  primary?: boolean;
  options?: string[];
  width?: number;
}

export interface SmartsheetRow {
  id: number;
  rowNumber?: number;
  parentId?: number;
  expanded?: boolean;
  createdAt?: string;
  modifiedAt?: string;
  cells: SmartsheetCell[];
  locked?: boolean;
  lockedForUser?: boolean;
}

export interface SmartsheetCell {
  columnId: number;
  value?: unknown;
  displayValue?: string;
  formula?: string;
  hyperlink?: SmartsheetHyperlink;
}

export interface SmartsheetHyperlink {
  url?: string;
  sheetId?: number;
  reportId?: number;
}

export interface SmartsheetReport {
  id: number;
  name: string;
  accessLevel?: string;
  permalink?: string;
  createdAt?: string;
  modifiedAt?: string;
  columns?: SmartsheetColumn[];
  rows?: SmartsheetRow[];
  totalRowCount?: number;
}

export interface SmartsheetWorkspace {
  id: number;
  name: string;
  accessLevel?: string;
  permalink?: string;
  sheets?: SmartsheetSheet[];
  folders?: SmartsheetFolder[];
  reports?: SmartsheetReport[];
  dashboards?: SmartsheetDashboard[];
}

export interface SmartsheetFolder {
  id: number;
  name: string;
  sheets?: SmartsheetSheet[];
  folders?: SmartsheetFolder[];
  reports?: SmartsheetReport[];
}

export interface SmartsheetDashboard {
  id: number;
  name: string;
  accessLevel?: string;
  permalink?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export interface SmartsheetDiscussion {
  id: number;
  title?: string;
  lastCommentedAt?: string;
  lastCommentedUser?: SmartsheetUser;
  comments?: SmartsheetComment[];
  commentCount?: number;
}

export interface SmartsheetComment {
  id: number;
  text: string;
  createdBy?: SmartsheetUser;
  createdAt?: string;
  modifiedAt?: string;
  attachments?: SmartsheetAttachment[];
}

export interface SmartsheetUser {
  email: string;
  name?: string;
}

export interface SmartsheetAttachment {
  id: number;
  name: string;
  attachmentType: string;
  url?: string;
  urlExpiresInMillis?: number;
  sizeInKb?: number;
  mimeType?: string;
  createdAt?: string;
  createdBy?: SmartsheetUser;
  parentType?: string;
  parentId?: number;
}

export interface SmartsheetPaginatedResponse<T> {
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  data: T[];
}

export interface SmartsheetUpdateRowRequest {
  id: number;
  cells?: SmartsheetCell[];
  locked?: boolean;
  expanded?: boolean;
  parentId?: number;
  siblingId?: number;
  toTop?: boolean;
  toBottom?: boolean;
  indent?: number;
  outdent?: number;
}

export interface SmartsheetAddRowRequest {
  cells: SmartsheetCell[];
  toTop?: boolean;
  toBottom?: boolean;
  parentId?: number;
  siblingId?: number;
  expanded?: boolean;
}

export interface BulkOperationResult {
  message: string;
  resultCode: number;
  result?: SmartsheetRow[];
  version?: number;
  failedItems?: unknown[];
}
