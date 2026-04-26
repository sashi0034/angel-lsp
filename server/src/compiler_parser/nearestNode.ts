import {Node_Script, NodeObject} from './nodeObject';
import {getNodeChildren} from './nodeChildren';
import {TextPosition} from '../compiler_tokenizer/textLocation';

export type NearestNode = {
    precedingNode: NodeObject | undefined;
    containingNode: NodeObject | undefined;
    followingNode: NodeObject | undefined;
};

// TODO: Rename
export function findNearestNode(node: NodeObject | Node_Script, caret: TextPosition): NearestNode[] {
    const children = [...getChildren(node)].sort(compareNodePosition);
    let precedingNode: NodeObject | undefined;

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

function getChildren(node: NodeObject | Node_Script): NodeObject[] {
    return Array.isArray(node) ? node : getNodeChildren(node);
}

function compareNodePosition(lhs: NodeObject, rhs: NodeObject): number {
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
