import {Node_Script, NodeBase} from './nodes';
import {getNodeChildren} from './nodeChildren';
import {TextPosition} from '../compiler_tokenizer/textLocation';

type NearestNode = {
    precedingNode: NodeBase | undefined;
    containingNode: NodeBase | undefined;
    followingNode: NodeBase | undefined;
};

export function findNearestNode(node: NodeBase | Node_Script, caret: TextPosition): NearestNode[] {
    const children = [...getChildren(node)].sort(compareNodePosition);
    let precedingNode: NodeBase | undefined;

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childLocation = child.nodeRange.getBoundingLocation();
        if (childLocation.positionInRange(caret)) {
            return [
                {
                    precedingNode,
                    containingNode: child,
                    followingNode: children[i + 1]
                },
                ...findNearestNode(child, caret)
            ];
        }

        if (childLocation.end.isLessThan(caret)) {
            precedingNode = child;
            continue;
        }

        return [
            {
                precedingNode,
                containingNode: undefined,
                followingNode: child
            }
        ];
    }

    return [
        {
            precedingNode,
            containingNode: undefined,
            followingNode: undefined
        }
    ];
}

function getChildren(node: NodeBase | Node_Script): NodeBase[] {
    return Array.isArray(node) ? node : getNodeChildren(node);
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
