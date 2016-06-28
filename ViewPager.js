'use strict';

import React, {
  Component,
  PropTypes,
} from 'react';
import {
  Dimensions,
  View,
  PanResponder,
  Animated,
  StyleSheet,
  ScrollView,
  ViewPagerAndroid,
  Platform
} from 'react-native';

var DefaultViewPageIndicator = require('./DefaultViewPageIndicator');
var deviceWidth = Dimensions.get('window').width;

const propTypes = {
  ...View.propTypes,
  onChangePage : PropTypes.func,
  renderPageIndicator :
    PropTypes.oneOfType([
      PropTypes.func,
      PropTypes.bool
    ]),
  isLoop : PropTypes.bool,
  locked : PropTypes.bool,
  autoPlay : PropTypes.bool,
  animation : PropTypes.func, // only work when nativeRender = false
  currentPage : PropTypes.number,
  cacheNum : PropTypes.number,
  nativeRender : PropTypes.bool, // if true ios use ScrollView, android use ViewPagerAndroid
}

const defaultProps = {
  isLoop: false,
  locked: false,
  currentPage: 0,
  nativeRender : true,
  cacheNum : 1,
  animation: function (animate, toValue) {
    return Animated.spring(animate,
      {
        toValue: toValue,
        friction: 10,
        tension: 50,
      })
  },
}

export default class ViewPager extends Component
{
  constructor(props) {
    super(props);

    this.state = {
      currentPage: props.currentPage,
      viewWidth: 0,
      scrollValue: new Animated.Value(props.currentPage === 0 ? 0 : 1)
    }
  }

  fling = false;

  componentWillMount() {

    var release = (e, gestureState) => {
      const  relativeGestureDistance = gestureState.dx / deviceWidth
      const vx = gestureState.vx;

      let step = 0;
      if (relativeGestureDistance < -0.2 || (relativeGestureDistance < 0 && vx <= -0.5)) {
        step = 1;
      } else if (relativeGestureDistance > 0.2 || (relativeGestureDistance > 0 && vx >= 0.5)) {
        step = -1;
      }

      this.props.hasTouch && this.props.hasTouch(false);

      this.movePage(step);
    }

    this._panResponder = PanResponder.create({

      onMoveShouldSetPanResponder: (e, gestureState) => {
        if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          if (/* (gestureState.moveX <= this.props.edgeHitWidth ||
             gestureState.moveX >= deviceWidth - this.props.edgeHitWidth) && */
          this.props.locked !== true && !this.fling) {
            this.props.hasTouch && this.props.hasTouch(true);
            return true;
          }
        }
      },

      onPanResponderRelease: release,
      onPanResponderTerminate: release,

      onPanResponderMove: (e, gestureState) => {
        var dx = gestureState.dx;
        var offsetX = -dx / this.state.viewWidth + this.childIndex;
        this.state.scrollValue.setValue(offsetX);
      },
      onPanResponderTerminationRequest: (evt, gestureState) => {
        return true;
      },
    });

    this._updateChildIndex();
  }

  componentDidMount()
  {
    const pageCount = this._getPageCount()
    if (this.props.autoPlay && pageCount > 1) {
      this._startAutoPlay();
    }
  }

  componentWillUnmount() {
    if (this._autoPlayer) {
      clearInterval(this._autoPlayer);
      this._autoPlayer = null;
    }
  }

  componentWillReceiveProps(nextProps)
  {
    const pageCount = nextProps.children.length;

    if (nextProps.autoPlay && pageCount > 1) {
      this._startAutoPlay();
    }
    else {
      if (this._autoPlayer) {
        clearInterval(this._autoPlayer);
        this._autoPlayer = null;
      }
    }

    this._updateChildIndex(nextProps);
  }

  _getPageCount() {
    return this.props.children.length;
  }

  _startAutoPlay()
  {
    if (!this._autoPlayer) {
      this._autoPlayer = setInterval(
        () => {
          this.movePage(1, true);
        },
        5000
      )
    }
  }

  goToPage(pageNumber)
  {
    var pageCount = this._getPageCount();
    if (pageNumber < 0 || pageNumber >= pageCount) {
      console.error('Invalid page number: ', pageNumber);
      return
    }

    var step = pageNumber - this.state.currentPage;
    this.movePage(step);
  }

  _updateChildIndex(props = this.props) {
    const {cacheNum, isLoop} = props;
    const pageCount = props.children.length;
    const {currentPage} = this.state;
    const nextCurPage = Math.max(0, Math.min(currentPage, pageCount - 1));
    if (currentPage !== nextCurPage) {
      this.setState({currentPage : nextCurPage})
    }

    const loop = isLoop && pageCount > 1;
    this.childIndex = cacheNum;
    if (loop && nextCurPage < cacheNum-1) {
      this.childIndex = nextCurPage + 1
    }
    else if (!loop && nextCurPage < cacheNum) {
      this.childIndex = nextCurPage
    }
    this.state.scrollValue.setValue(this.childIndex);
  }

  movePage(step, animated)
  {
    const pageCount = this._getPageCount()
    const {cacheNum, isLoop} = this.props;
    const loop = isLoop && pageCount > 1;
    let nextCurPage = this.state.currentPage + step;

    if (loop) {
      nextCurPage = (nextCurPage + pageCount) % pageCount;
    } else {
      nextCurPage = Math.min(Math.max(0, nextCurPage), pageCount - 1);
    }

    var moved = nextCurPage !== this.state.currentPage;

    this.fling = true;

    let nextChildIdx = cacheNum;
    if (loop && nextCurPage < cacheNum-1) {
      nextChildIdx = nextCurPage + 1
    }
    else if (!loop && nextCurPage < cacheNum) {
      nextChildIdx = nextCurPage
    }

    const finish = ()=>{
      this.fling = false;
      this.childIndex = nextChildIdx;
      this.state.scrollValue.setValue(this.childIndex);
      this.setState({
        currentPage: nextCurPage,
      }, ()=>{
        moved && this.props.onChangePage && this.props.onChangePage(nextCurPage);
      });
    }
    if (this.scrollViewIOS) {
      if (animated) {
        if (loop) {
          this._scrollToIOS(this.childIndex + 1, true);
        }
        else {
          if (this.childIndex !== nextChildIdx) {
            this._scrollToIOS(nextChildIdx, true);
          }
        }
      }
      else {
        finish();
        this._scrollToIOS(nextChildIdx, false);
      }
    }
    else if (this.viewPagerAndroid) {
      finish();
      let viewPagerAndroidIndex = nextCurPage;
      if (loop) {viewPagerAndroidIndex += 1;}
      if (animated) {
        this.viewPagerAndroid.setPage(viewPagerAndroidIndex);
      }
      else {
        this.viewPagerAndroid.setPageWithoutAnimation(viewPagerAndroidIndex);
      }
    }
    else {
      var scrollStep = (moved ? step : 0) + this.childIndex;
      this.props.animation(this.state.scrollValue, scrollStep)
        .start((event) => {
          finish()
        });
    }
  }

  _scrollToIOS(childIndex, animated) {
    this.scrollViewIOS.scrollTo({x:this.state.viewWidth * childIndex,y:0, animated});
  }

  getCurrentPage()
  {
    const count = this.props.children.length;
    return this.state.currentPage % count;
  }

  renderPageIndicator(props)
  {
    if (this.props.renderPageIndicator === false) {
      return null;
    } else if (this.props.renderPageIndicator) {
      return React.cloneElement(this.props.renderPageIndicator(), props);
    } else {
      return (
        <View style={styles.indicators}>
          <DefaultViewPageIndicator {...props} />
        </View>
      );
    }
  }

  _getPage(pageIdx, loop = false)
  {
    const {children} = this.props;
    const index = pageIdx % children.length;
    return React.cloneElement(children[index], {key: 'p_' + index + (loop ? '_1' : '')})
  }

  render()
  {
    if (this.props.nativeRender && Platform.OS === 'android') {
      return this.renderViewPagerAndroid();
    }

    const pageCount = this._getPageCount();
    const {cacheNum, isLoop} = this.props;
    const loop = isLoop && pageCount > 1;
    const {currentPage, scrollValue} = this.state;

    var bodyComponents = [];

    var viewWidth = this.state.viewWidth;

    if (pageCount > 0 && viewWidth > 0) {
      // left page
      for (let i=currentPage-cacheNum;i<currentPage;i++) {
        if (i>=0) {
          bodyComponents.push(this._getPage(i));
        }
        else if (loop && i==-1) {
          bodyComponents.push(this._getPage(pageCount + i, true));
        }
      }

      // center page
      bodyComponents.push(this._getPage(currentPage, currentPage===pageCount));

      for (let i=currentPage+1; i<=currentPage + cacheNum; i++) {
        if (i<pageCount) {
          bodyComponents.push(this._getPage(i));
        }
        else if (loop && i==pageCount) {
          bodyComponents.push(this._getPage(i-pageCount, true));
        }
      }
    }

    var sceneContainerStyle = {
      width: viewWidth * bodyComponents.length,
      flex: 1,
      flexDirection: 'row'
    };

    var translateX = scrollValue.interpolate({
      inputRange: [0, 1], outputRange: [0, -viewWidth]
    });

    return (
      <View style={{flex: 1}}
            onLayout={(event) => {
              // console.log('ViewPager.onLayout()');
              var viewWidth = event.nativeEvent.layout.width;
              if (!viewWidth || this.state.viewWidth === viewWidth) {
                return;
              }
              this.setState({
                currentPage: this.state.currentPage,
                viewWidth: viewWidth,
              });
            }}
      >
        {
          this.props.nativeRender && Platform.OS === 'ios'?
            this.renderScrollViewIOS(bodyComponents, sceneContainerStyle):
            this.renderAnimationView(bodyComponents, sceneContainerStyle, translateX)
        }
        {this.renderPageIndicator({
          goToPage: this.goToPage.bind(this),
          pageCount: pageCount,
          activePage: currentPage,
          scrollValue: scrollValue,
          scrollOffset: this.childIndex,
        })}
      </View>
    );
  }

  renderAnimationView(bodyComponents, sceneContainerStyle, translateX) {
    return (
      <Animated.View style={[sceneContainerStyle, {transform: [{translateX}]}]}
        {...this._panResponder.panHandlers}>
        <View
          style={sceneContainerStyle}
        >
          {bodyComponents}
        </View>
      </Animated.View>
    )
  }

  renderScrollViewIOS(bodyComponents, sceneContainerStyle) {
      const viewWidth = this.state.viewWidth;
      return(
        <ScrollView style = {{flex:1, width:viewWidth}}
          horizontal = {true}
          showsHorizontalScrollIndicator = {false}
          showsVerticalScrollIndicator = {false}
          scrollsToTop = {false}
          pagingEnabled = {true}
          contentOffset = {{x:this.childIndex * viewWidth,y:0}}
          ref={ref=>this.scrollViewIOS = ref}
          contentContainerStyle={sceneContainerStyle}
          onScrollBeginDrag={this.onScrollBeginDragIOS.bind(this)}
          onScrollEndDrag = {this.onScrollEndDragIOS.bind(this)}
          onMomentumScrollEnd={this.onScrollEndIOS.bind(this)}
        >
          {
            bodyComponents
          }
        </ScrollView>
      )
  }

  onScrollBeginDragIOS(e) {
    this.fling = true;
    this.props.hasTouch && this.props.hasTouch(false);
  }

  onScrollEndDragIOS(e) {
    const v = e.nativeEvent.velocity.x;
    this.props.hasTouch && this.props.hasTouch(false);
  }

  onScrollEndIOS(e) {
    this.fling = false;

    const viewWidth = this.state.viewWidth;
    const offsetX = e.nativeEvent.contentOffset.x;
    const curPage = Math.floor(offsetX/viewWidth + 0.5);

    if (curPage != this.childIndex) {
      this.movePage(curPage-this.childIndex);
    }
  }

  renderViewPagerAndroid() {
    const {isLoop} = this.props;
    const count = this._getPageCount();
    const loop = isLoop && count > 1;

    let bodyComponents = [];
    for (let i = 0;i<count;i++) {
      bodyComponents.push(this._getPage(i, false));
    }

    if (loop) {
      bodyComponents = [this._getPage(count-1, true),...bodyComponents, this._getPage(0, true)];
    }

    return (
      <View style={{flex: 1}}
            onLayout={(event) => {
              var viewWidth = event.nativeEvent.layout.width;
              if (!viewWidth || this.state.viewWidth === viewWidth) {
                return;
              }
              this.setState({
                currentPage: this.state.currentPage,
                viewWidth: viewWidth,
              });
            }}
      >
        <ViewPagerAndroid
          ref={ref=>this.viewPagerAndroid = ref}
          style={{flex: 1}}
          initialPage={this.state.currentPage + (loop?1:0)}
          onPageSelected={this.onPageChangedAndroid.bind(this)}
        >
          {
            bodyComponents
          }
        </ViewPagerAndroid>
        {this.renderPageIndicator({
          goToPage: this.goToPage.bind(this),
          pageCount: count,
          activePage: this.state.currentPage,
          scrollValue: this.state.scrollValue,
          scrollOffset: this.childIndex,
        })}
      </View>
    )
  }

  onPageChangedAndroid(e) {
    const {isLoop} = this.props;
    const count = this._getPageCount()
    const loop = isLoop && count > 1;

    let position = e.nativeEvent.position;
    if (loop) {
      position = position-1;
    }

    if(position != this.state.currentPage) {
      this.movePage(position-this.state.currentPage);
    }
  }

}

ViewPager.propTypes = propTypes;
ViewPager.defaultProps = defaultProps;

var styles = StyleSheet.create({
  indicators: {
    flex: 1,
    alignItems: 'center',
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
});
