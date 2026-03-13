import styled from 'styled-components';


const SamplePanelContainer = styled.div`
    position: relative;
    width: 98%;
    margin: 0px 10px 10px 10px;
    transition: 0.5s ease-in;
    -webkit-transition: 0.5s ease-in;
    border: 1px solid ${(props) => props.sampleColour};
    border-radius: 5px;
    border-left: 5px solid ${(props) => props.sampleColour};
    overflow: hidden;
    height: ${(props) => props.panelExpanded ? "350px" : "22px"};
    min-height: ${(props) => props.panelExpanded ? "350px" : "22px"};

    > .infoRow {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
    }
    > .infoRow > span,
    > .infoRow > div {
        font-weight: normal;
        font-size: 0.95em;
    }
    > .infoRow > *:first-child {
        padding-top: 1px;
        padding-left: 8px;
        flex-basis: 15%; /* it's a child of a flexbox */
        display: flex; /* to align the icon & text nicely */
        align-items: center;
    }
    > .infoRow > *:first-child > span {
        padding-left: 5px; /* space between sample text & icon */
    }
    > .infoRow > *:last-child {
        padding-right: 10px;
    }

`;

export const ChartContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-between;
    height: calc(100% - 20px);
`;

export const ExpandIconContainer = styled.div`
    color: ${(props) => props.theme.themeTextColour};
    position: absolute;
    top: 3px;
    right: 5px;
    cursor: pointer;
    transform: scale(1.3);
`;

export default SamplePanelContainer;