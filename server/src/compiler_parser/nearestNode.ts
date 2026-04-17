import {Node_Script, NodeBase} from './nodes';
import {getNodeChildren} from './nodeChildren';
import {TextPosition} from '../compiler_tokenizer/textLocation';

type NearestNode =
    | {
          // Whether the caret is inside a child node.
          hasChild: true;
          containingNode: NodeBase;
      }
    | {
          // When the caret is not on a node.
          hasChild: false;
          precedingNode: NodeBase | undefined;
          containingNode: NodeBase | undefined;
          followingNode: NodeBase | undefined;
      };

export function findNearestNode(node: NodeBase | Node_Script, caret: TextPosition): NearestNode[] {
    const children = [...getChildren(node)].sort(compareNodePosition);
    let precedingNode: NodeBase | undefined;

    for (const child of children) {
        const childLocation = child.nodeRange.getBoundingLocation();
        if (childLocation.positionInRange(caret)) {
            return [{hasChild: true, containingNode: child}, ...findNearestNode(child, caret)];
        }

        if (childLocation.end.isLessThan(caret)) {
            precedingNode = child;
            continue;
        }

        return [
            {
                hasChild: false,
                precedingNode,
                containingNode: getContainingNode(node, caret),
                followingNode: child
            }
        ];
    }

    return [
        {
            hasChild: false,
            precedingNode,
            containingNode: getContainingNode(node, caret),
            followingNode: undefined
        }
    ];
}

function getChildren(node: NodeBase | Node_Script): NodeBase[] {
    return Array.isArray(node) ? node : getNodeChildren(node);
}

function getContainingNode(node: NodeBase | Node_Script, caret: TextPosition): NodeBase | undefined {
    if (Array.isArray(node)) {
        return undefined;
    }

    return node.nodeRange.getBoundingLocation().positionInRange(caret) ? node : undefined;
}

function compareNodePosition(lhs: NodeBase, rhs: NodeBase): number {
    const lhsStart = lhs.nodeRange.start.location.start;
    const rhsStart = rhs.nodeRange.start.location.start;
    if (lhsStart.isLessThan(rhsStart)) {
        return -1;
    }

    if (rhsStart.isLessThan(lhsStart)) {
        return 1;
    }

    const lhsEnd = lhs.nodeRange.end.location.end;
    const rhsEnd = rhs.nodeRange.end.location.end;
    if (lhsEnd.isLessThan(rhsEnd)) {
        return -1;
    }

    if (rhsEnd.isLessThan(lhsEnd)) {
        return 1;
    }

    return 0;
}
