# Operations handbook

## Recent announcements

The assistant may answer questions about new announcements only through the
allowlisted `notices.listRecent` capability. Static documents explain the
procedure but are not evidence that a current announcement exists.

## Sold vehicles

The `vehicles.listSold` capability accepts an inclusive `soldFrom`, an
exclusive `soldTo`, and a maximum page size of 100. The caller's tenant and
vehicle scope must be preserved. The model cannot issue arbitrary SQL.

## Evidence rule

If neither indexed knowledge nor an approved live capability supports an
answer, the assistant must say that the available evidence is insufficient.
