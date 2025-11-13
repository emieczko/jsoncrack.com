import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, unknown> = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// helpers to read and write JSON at a path
function getAtPath(root: any, path: (string | number)[] = []) {
  let ref = root;
  for (const key of path) {
    if (ref == null) return undefined;
    ref = ref[key as any];
  }
  return ref;
}
function setAtPath(root: any, path: (string | number)[] = [], value: any) {
  if (!path || path.length === 0) return value;
  let ref = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i] as any;
    const nextIsIndex = typeof path[i + 1] === "number";
    if (ref[key] == null || typeof ref[key] !== "object") {
      ref[key] = nextIsIndex ? [] : {};
    }
    ref = ref[key];
  }
  ref[path[path.length - 1] as any] = value;
  return root;
}

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);

  // Edit mode + draft content
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string>("");
  const [draftError, setDraftError] = React.useState<string | null>(null);

  const getJson = useJson(state => state.getJson);
  const setContents = useFile(state => state.setContents);

  // Reset draft when modal opens or selected node changes
  React.useEffect(() => {
    if (opened) {
      setIsEditing(false);
      setDraftError(null);
      setDraft(normalizeNodeData(nodeData?.text ?? []));
    }
  }, [opened, nodeData?.text]);

  // Validate draft JSON to enable Save only when valid
  const isDraftValid = React.useMemo(() => {
    try {
      JSON.parse(draft);
      setDraftError(null);
      return true;
    } catch (e: any) {
      setDraftError(e?.message || "Invalid JSON");
      return false;
    }
  }, [draft]);

  const handleSave = () => {
    if (!isEditing || !isDraftValid) return;
    const path = nodeData?.path ?? [];

    try {
      const rootJsonStr = getJson();
      const root = JSON.parse(rootJsonStr);
      const parsedDraft = JSON.parse(draft);

      const currentAtPath = getAtPath(root, path);

      if (
        parsedDraft !== null &&
        typeof parsedDraft === "object" &&
        !Array.isArray(parsedDraft) &&
        currentAtPath !== null &&
        typeof currentAtPath === "object" &&
        !Array.isArray(currentAtPath)
      ) {
        // Shallow-merge only the edited keys into the existing object
        Object.entries(parsedDraft).forEach(([k, v]) => {
          (currentAtPath as any)[k] = v;
        });
      } else {
        // Replace for primitives/arrays or when target isn't an object
        setAtPath(root, path, parsedDraft);
      }

      const updatedStr = JSON.stringify(root, null, 2);

      // Update left editor and (debounced) graph via useFile
      setContents({ contents: updatedStr, hasChanges: true });

      // Exit edit mode
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancel = () => {
    // discard changes and exit edit mode
    setDraft(normalizeNodeData(nodeData?.text ?? []));
    setDraftError(null);
    setIsEditing(false);
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex align="center" gap="xs">
              <Button size="xs" variant={isEditing ? "filled" : "light"} onClick={() => setIsEditing(true)}>
                Edit
              </Button>
              <Button
                size="xs"
                variant="filled"
                color="blue"
                disabled={!isEditing || !isDraftValid}
                onClick={handleSave}
              >
                Save
              </Button>
              <Button size="xs" variant="default" color="gray" disabled={!isEditing} onClick={handleCancel}>
                Cancel
              </Button>
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>

          {isEditing ? (
            <>
              <Textarea
                value={draft}
                onChange={e => setDraft(e.currentTarget.value)}
                autosize
                minRows={6}
                styles={{
                  input: {
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  },
                }}
                spellCheck={false}
              />
              {draftError ? (
                <Text fz="xs" c="red">
                  {draftError}
                </Text>
              ) : null}
            </>
          ) : (
            <ScrollArea.Autosize mah={250} maw={600}>
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          )}
        </Stack>

        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
}